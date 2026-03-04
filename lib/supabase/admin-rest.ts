import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { getSupabaseServiceEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);
const DEFAULT_ADMIN_REST_TIMEOUT_MS = 15000;
const ADMIN_REST_MAX_BUFFER = 1024 * 1024 * 8;

function getAdminRestTimeoutMs() {
  const rawValue = process.env.SUPABASE_SERVER_REQUEST_TIMEOUT_MS || process.env.SUPABASE_REQUEST_TIMEOUT_MS;
  if (!rawValue) {
    return DEFAULT_ADMIN_REST_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ADMIN_REST_TIMEOUT_MS;
  }

  return parsed;
}

interface AdminRestPayload {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyBase64: string;
  timeoutMs: number;
}

async function runAdminRestRequest(payload: AdminRestPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const scriptPath = path.join(process.cwd(), "scripts", "supabase-http.ps1");

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, encodedPayload], {
    maxBuffer: ADMIN_REST_MAX_BUFFER,
    timeout: payload.timeoutMs + 5000
  });

  return JSON.parse(stdout.trim()) as {
    status: number;
    bodyBase64?: string;
  };
}

export async function fetchSupabaseAdminRestJson<T>(pathWithQuery: string, init?: { method?: string; body?: unknown }) {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  const timeoutMs = getAdminRestTimeoutMs();
  const body = init?.body === undefined ? "" : JSON.stringify(init.body);
  const result = await runAdminRestRequest({
    url: `${url}/rest/v1/${pathWithQuery}`,
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
  });

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
