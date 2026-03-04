import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { getSupabaseRequestTimeoutMs } from "@/lib/supabase/fetch";

const execFileAsync = promisify(execFile);
const SERVER_FETCH_MAX_BUFFER = 1024 * 1024 * 8;
const DEFAULT_SERVER_SUPABASE_TIMEOUT_MS = 15000;
const FALLBACK_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND"
]);

function createUnavailableResponse(status: number) {
  return new Response(
    JSON.stringify({
      error: "fetch failed",
      message: "fetch failed",
      code: "SUPABASE_UNAVAILABLE"
    }),
    {
      status,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}

function getServerSupabaseRequestTimeoutMs() {
  const rawValue = process.env.SUPABASE_SERVER_REQUEST_TIMEOUT_MS || process.env.SUPABASE_REQUEST_TIMEOUT_MS;
  if (!rawValue) {
    return Math.max(getSupabaseRequestTimeoutMs(), DEFAULT_SERVER_SUPABASE_TIMEOUT_MS);
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(getSupabaseRequestTimeoutMs(), DEFAULT_SERVER_SUPABASE_TIMEOUT_MS);
  }

  return parsed;
}

function shouldUsePowerShellFallback(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause as { code?: string } | undefined;
  return error.message.includes("fetch failed") || (cause?.code ? FALLBACK_ERROR_CODES.has(cause.code) : false);
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function getBodyBase64(body: BodyInit | null | undefined) {
  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return Buffer.from(body, "utf8").toString("base64");
  }

  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString(), "utf8").toString("base64");
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString("base64");
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer()).toString("base64");
  }

  return Buffer.from(String(body), "utf8").toString("base64");
}

async function powerShellFetch(input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number) {
  const headers = new Headers(init?.headers);
  const payload = {
    url: getRequestUrl(input),
    method: init?.method || "GET",
    headers: Object.fromEntries(headers.entries()),
    bodyBase64: await getBodyBase64(init?.body),
    timeoutMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const scriptPath = path.join(process.cwd(), "scripts", "supabase-http.ps1");

  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, encodedPayload],
    {
      maxBuffer: SERVER_FETCH_MAX_BUFFER,
      timeout: timeoutMs + 5000
    }
  );
  const result = JSON.parse(stdout.trim()) as {
    status: number;
    headers?: Record<string, string>;
    bodyBase64?: string;
  };

  return new Response(Buffer.from(result.bodyBase64 || "", "base64"), {
    status: result.status,
    headers: result.headers
  });
}

export function createServerSupabaseFetch(timeoutMs = getServerSupabaseRequestTimeoutMs()): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const externalSignal = init?.signal;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const abortFromExternal = () => {
      controller.abort(externalSignal?.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, { once: true });
      }
    }

    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (externalSignal?.aborted) {
        throw error;
      }

      if (timedOut || shouldUsePowerShellFallback(error)) {
        try {
          return await powerShellFetch(
            input,
            {
              ...init,
              signal: undefined
            },
            timeoutMs
          );
        } catch {
          return createUnavailableResponse(timedOut ? 504 : 503);
        }
      }

      return createUnavailableResponse(503);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (externalSignal) {
        externalSignal.removeEventListener("abort", abortFromExternal);
      }
    }
  };
}
