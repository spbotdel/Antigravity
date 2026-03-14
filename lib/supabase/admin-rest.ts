import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { getSupabaseServiceEnv } from "@/lib/env";
import { getSupabaseRequestTimeoutMs } from "@/lib/supabase/fetch";

const execFileAsync = promisify(execFile);
const DEFAULT_ADMIN_REST_TIMEOUT_MS = 15000;
const ADMIN_REST_MAX_BUFFER = 1024 * 1024 * 8;
const ADMIN_REST_NATIVE_FALLBACK_COOLDOWN_MS = 60000;
const ADMIN_REST_NATIVE_MAX_ATTEMPTS = 2;
const FALLBACK_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND"
]);
let nativeAdminRestFallbackUntil = 0;

// FRAMEWORK_RULE: Server-side Supabase admin REST should stay native-first; the PowerShell bridge is fallback/debug transport, not the default request path.

export function parsePowerShellJsonStdout<T>(rawStdout: string): T {
  const withoutBom = rawStdout.replace(/^\uFEFF/, "");
  const withoutNulls = withoutBom.replace(/\u0000/g, "");
  const trimmed = withoutNulls.trim();
  const firstBrace = trimmed.search(/[\[{]/);
  const lastObject = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  const candidate =
    firstBrace >= 0 && lastObject >= firstBrace
      ? trimmed.slice(firstBrace, lastObject + 1)
      : trimmed;

  return JSON.parse(candidate) as T;
}

function getAdminRestTimeoutMs() {
  const rawValue = process.env.SUPABASE_SERVER_REQUEST_TIMEOUT_MS || process.env.SUPABASE_REQUEST_TIMEOUT_MS;
  if (!rawValue) {
    return Math.max(getSupabaseRequestTimeoutMs(), DEFAULT_ADMIN_REST_TIMEOUT_MS);
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(getSupabaseRequestTimeoutMs(), DEFAULT_ADMIN_REST_TIMEOUT_MS);
  }

  return parsed;
}

interface AdminRestPayload {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyBase64: string;
  includeHeaders?: boolean;
  timeoutMs: number;
}

interface AdminRestResult {
  status: number;
  headers?: Record<string, string>;
  bodyBase64?: string;
}

class AdminRestFallbackError extends Error {
  status: number;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "AdminRestFallbackError";
    this.status = status;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function getAdminRestTransportMode() {
  const rawValue = process.env.SUPABASE_ADMIN_REST_TRANSPORT?.trim().toLowerCase();
  if (rawValue === "native" || rawValue === "powershell") {
    return rawValue;
  }

  return "auto";
}

function shouldUsePowerShellFallback(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause as { code?: string } | undefined;
  return error.message.includes("fetch failed") || (cause?.code ? FALLBACK_ERROR_CODES.has(cause.code) : false);
}

function shouldPreferPowerShellAdminRestNow() {
  return Date.now() < nativeAdminRestFallbackUntil;
}

function noteNativeAdminRestFallback() {
  nativeAdminRestFallbackUntil = Date.now() + ADMIN_REST_NATIVE_FALLBACK_COOLDOWN_MS;
}

export function resetAdminRestFallbackCooldownForTests() {
  nativeAdminRestFallbackUntil = 0;
}

function createUnavailableAdminRestResult(status: number): AdminRestResult {
  const body = JSON.stringify({
    error: "fetch failed",
    message: "fetch failed",
    code: "SUPABASE_UNAVAILABLE"
  });

  return {
    status,
    headers: {
      "content-type": "application/json"
    },
    bodyBase64: Buffer.from(body, "utf8").toString("base64")
  };
}

async function runAdminRestRequest(payload: AdminRestPayload) {
  const [result] = await runAdminRestRequests([payload]);
  return result;
}

async function runPowerShellAdminRestRequests(payloads: AdminRestPayload[]) {
  const encodedPayload = Buffer.from(JSON.stringify(payloads), "utf8").toString("base64");
  const scriptPath = path.join(process.cwd(), "scripts", "supabase-http.ps1");
  const maxTimeoutMs = payloads.reduce((maxValue, payload) => Math.max(maxValue, payload.timeoutMs), 0);

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, encodedPayload], {
    maxBuffer: ADMIN_REST_MAX_BUFFER,
    timeout: maxTimeoutMs + 5000
  });

  const parsed = parsePowerShellJsonStdout<AdminRestResult | AdminRestResult[]>(stdout);

  return Array.isArray(parsed) ? parsed : [parsed];
}

async function runNativeAdminRestRequest(payload: AdminRestPayload): Promise<AdminRestResult> {
  for (let attempt = 1; attempt <= ADMIN_REST_NATIVE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, payload.timeoutMs);

    try {
      const response = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.bodyBase64 ? Buffer.from(payload.bodyBase64, "base64") : undefined,
        signal: controller.signal
      });
      const bodyBuffer = Buffer.from(await response.arrayBuffer());

      return {
        status: response.status,
        headers: payload.includeHeaders ? Object.fromEntries(response.headers.entries()) : {},
        bodyBase64: bodyBuffer.toString("base64")
      };
    } catch (error) {
      const transientNativeFailure = timedOut || shouldUsePowerShellFallback(error);
      if (transientNativeFailure && attempt < ADMIN_REST_NATIVE_MAX_ATTEMPTS) {
        continue;
      }

      if (timedOut) {
        throw new AdminRestFallbackError(504, "Native Supabase admin REST request timed out.", error);
      }

      if (shouldUsePowerShellFallback(error)) {
        throw new AdminRestFallbackError(503, "Native Supabase admin REST request failed.", error);
      }

      return createUnavailableAdminRestResult(503);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  return createUnavailableAdminRestResult(503);
}

async function runNativeAdminRestRequests(payloads: AdminRestPayload[]) {
  return Promise.all(payloads.map((payload) => runNativeAdminRestRequest(payload)));
}

async function runAdminRestRequests(payloads: AdminRestPayload[]) {
  const transportMode = getAdminRestTransportMode();

  if (transportMode === "powershell") {
    return runPowerShellAdminRestRequests(payloads);
  }

  if (transportMode === "auto" && shouldPreferPowerShellAdminRestNow()) {
    try {
      return await runPowerShellAdminRestRequests(payloads);
    } catch {
      return payloads.map(() => createUnavailableAdminRestResult(503));
    }
  }

  try {
    return await runNativeAdminRestRequests(payloads);
  } catch (error) {
    if (transportMode === "auto" && error instanceof AdminRestFallbackError) {
      noteNativeAdminRestFallback();
      try {
        return await runPowerShellAdminRestRequests(payloads);
      } catch {
        return payloads.map(() => createUnavailableAdminRestResult(error.status));
      }
    }

    if (error instanceof AdminRestFallbackError) {
      return payloads.map(() => createUnavailableAdminRestResult(error.status));
    }

    throw error;
  }
}

function buildAdminRestPayload(url: string, serviceRoleKey: string, timeoutMs: number, init?: { method?: string; body?: unknown }) {
  const body = init?.body === undefined ? "" : JSON.stringify(init.body);
  return {
    url,
    method: init?.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      "accept-profile": "public",
      "content-profile": "public",
      ...(body
        ? {
            "content-type": "application/json",
            prefer: "return=representation"
          }
        : {})
    },
    bodyBase64: body ? Buffer.from(body, "utf8").toString("base64") : "",
    timeoutMs
  } satisfies AdminRestPayload;
}

function buildAdminRestPayloadWithOptions(
  url: string,
  serviceRoleKey: string,
  timeoutMs: number,
  init?: { method?: string; body?: unknown; headers?: Record<string, string>; includeHeaders?: boolean }
) {
  const body = init?.body === undefined ? "" : JSON.stringify(init.body);
  return {
    url,
    method: init?.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      "accept-profile": "public",
      "content-profile": "public",
      ...(body
        ? {
            "content-type": "application/json",
            prefer: "return=representation"
          }
        : {}),
      ...(init?.headers || {})
    },
    bodyBase64: body ? Buffer.from(body, "utf8").toString("base64") : "",
    includeHeaders: Boolean(init?.includeHeaders),
    timeoutMs
  } satisfies AdminRestPayload;
}

function parseAdminRestResponseBody<T>(result: { status: number; bodyBase64?: string }) {
  const rawBody = Buffer.from(result.bodyBase64 || "", "base64").toString("utf8");
  const parsedBody = rawBody ? JSON.parse(rawBody) : null;

  if (result.status < 200 || result.status >= 300) {
    const message =
      (parsedBody &&
        typeof parsedBody === "object" &&
        "message" in parsedBody &&
        typeof parsedBody.message === "string" &&
        parsedBody.message) ||
      (parsedBody &&
        typeof parsedBody === "object" &&
        "error" in parsedBody &&
        typeof parsedBody.error === "string" &&
        parsedBody.error) ||
      `Supabase REST request failed with status ${result.status}.`;

    throw new Error(message);
  }

  return parsedBody as T;
}

export async function fetchSupabaseAdminRestBatchJson<T>(requests: Array<{ pathWithQuery: string; method?: string; body?: unknown }>) {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  const timeoutMs = getAdminRestTimeoutMs();
  const payloads = requests.map((request) =>
    buildAdminRestPayload(`${url}/rest/v1/${request.pathWithQuery}`, serviceRoleKey, timeoutMs, {
      method: request.method,
      body: request.body
    })
  );
  const results = await runAdminRestRequests(payloads);
  return results.map((result) => parseAdminRestResponseBody<T>(result));
}

export async function fetchSupabaseAdminRestJson<T>(pathWithQuery: string, init?: { method?: string; body?: unknown }) {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  const timeoutMs = getAdminRestTimeoutMs();
  const result = await runAdminRestRequest(
    buildAdminRestPayload(`${url}/rest/v1/${pathWithQuery}`, serviceRoleKey, timeoutMs, {
      method: init?.method,
      body: init?.body
    })
  );

  return parseAdminRestResponseBody<T>(result);
}

export async function fetchSupabaseAdminRestJsonWithHeaders<T>(
  pathWithQuery: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  const timeoutMs = getAdminRestTimeoutMs();
  const result = await runAdminRestRequest(
    buildAdminRestPayloadWithOptions(`${url}/rest/v1/${pathWithQuery}`, serviceRoleKey, timeoutMs, {
      method: init?.method,
      body: init?.body,
      headers: init?.headers,
      includeHeaders: true
    })
  );

  return {
    data: parseAdminRestResponseBody<T>(result),
    headers: (result as { headers?: Record<string, string> }).headers || {}
  };
}
