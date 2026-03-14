import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function readEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

const env = readEnv(path.resolve(".env.local"));
const baseUrlOverride = process.env.SMOKE_BASE_URL?.trim() || null;
let baseUrl = baseUrlOverride || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const storageBucket = env.NEXT_PUBLIC_STORAGE_BUCKET || "tree-photos";
const adminKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const execFileAsync = promisify(execFile);
const defaultSmokeServerPort = Number(env.SMOKE_LOCAL_PORT || 3102);
const FALLBACK_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND"
]);
if (!adminKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for auth smoke admin operations.");
}
const supabaseRestBaseUrl = `${supabaseUrl}/rest/v1`;

function shouldUsePowerShellFallback(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause;
  return error.message.includes("fetch failed") || (cause?.code ? FALLBACK_ERROR_CODES.has(cause.code) : false);
}

async function getBodyBase64(body) {
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

function parsePowerShellJsonStdout(rawStdout) {
  const withoutBom = rawStdout.replace(/^\uFEFF/, "");
  const withoutNulls = withoutBom.replace(/\u0000/g, "");
  const trimmed = withoutNulls.trim();
  const firstBrace = trimmed.search(/[\[{]/);
  const lastObject = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  const candidate =
    firstBrace >= 0 && lastObject >= firstBrace
      ? trimmed.slice(firstBrace, lastObject + 1)
      : trimmed;

  return JSON.parse(candidate);
}

function sanitizeJsonText(rawText) {
  const withoutBom = rawText.replace(/^\uFEFF/, "");
  const withoutNulls = withoutBom.replace(/\u0000/g, "");
  const trimmed = withoutNulls.trim();
  const firstBrace = trimmed.search(/[\[{]/);
  const lastObject = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  return firstBrace >= 0 && lastObject >= firstBrace
    ? trimmed.slice(firstBrace, lastObject + 1)
    : trimmed;
}

async function normalizeJsonResponse(response) {
  const responseHeaders = new Headers(response.headers);
  const contentType = responseHeaders.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response;
  }

  const rawText = await response.text();
  return new Response(sanitizeJsonText(rawText), {
    status: response.status,
    headers: responseHeaders
  });
}

async function powerShellFetch(input, init, timeoutMs) {
  const headers = new Headers(init?.headers);
  const payload = {
    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
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
    { timeout: timeoutMs + 5000, maxBuffer: 1024 * 1024 * 8 }
  );
  const result = parsePowerShellJsonStdout(stdout);
  const rawBody = Buffer.from(result.bodyBase64 || "", "base64");
  const responseHeaders = new Headers(result.headers || {});
  const contentType = responseHeaders.get("content-type") || "";
  const body =
    contentType.includes("application/json")
      ? Buffer.from(sanitizeJsonText(rawBody.toString("utf8")), "utf8")
      : rawBody;

  return new Response(body, {
    status: result.status,
    headers: responseHeaders
  });
}

function createResilientSupabaseFetch(timeoutMs = 30_000) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    let timeoutId = null;
    let timedOut = false;

    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });
      return normalizeJsonResponse(response);
    } catch (error) {
      if (timedOut || shouldUsePowerShellFallback(error)) {
        return powerShellFetch(input, { ...init, signal: undefined }, timeoutMs);
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

const supabaseAdminFetch = createResilientSupabaseFetch();

function buildRestHeaders(extraHeaders = {}) {
  return {
    apikey: adminKey,
    authorization: `Bearer ${adminKey}`,
    accept: "application/json",
    "accept-profile": "public",
    "content-profile": "public",
    ...extraHeaders
  };
}

async function adminRestJson(pathWithQuery, init = {}) {
  const response = await supabaseAdminFetch(`${supabaseRestBaseUrl}/${pathWithQuery}`, {
    method: init.method || "GET",
    headers: buildRestHeaders({
      ...(init.body !== undefined
        ? {
            "content-type": "application/json",
            prefer: "return=representation"
          }
        : {}),
      ...(init.headers || {})
    }),
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });

  const rawText = await response.text();
  const data = rawText ? JSON.parse(sanitizeJsonText(rawText)) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `${init.method || "GET"} ${pathWithQuery} failed with ${response.status}`);
  }

  return data;
}

async function adminRestDelete(pathWithQuery) {
  const response = await supabaseAdminFetch(`${supabaseRestBaseUrl}/${pathWithQuery}`, {
    method: "DELETE",
    headers: buildRestHeaders()
  });

  if (!response.ok) {
    const rawText = await response.text();
    const data = rawText ? JSON.parse(sanitizeJsonText(rawText)) : null;
    throw new Error(data?.message || data?.error || `DELETE ${pathWithQuery} failed with ${response.status}`);
  }
}

async function waitForHttpReady(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.status > 0) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for smoke server at ${url}`);
}

async function findAvailablePort(preferredPort) {
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const resolvedPort = typeof address === "object" && address ? address.port : port;
        server.close(() => resolve(resolvedPort));
      });
    });

  try {
    return await tryPort(preferredPort);
  } catch {
    return tryPort(0);
  }
}

async function startIsolatedSmokeServerIfNeeded() {
  if (baseUrlOverride) {
    return {
      baseUrl,
      async stop() {}
    };
  }

  if (!env.DEV_IMPERSONATE_USER_ID && !env.DEV_IMPERSONATE_USER_EMAIL) {
    return {
      baseUrl,
      async stop() {}
    };
  }

  const smokeServerPort = await findAvailablePort(defaultSmokeServerPort);
  const nextBaseUrl = `http://127.0.0.1:${smokeServerPort}`;
  const nextBinPath = path.resolve("node_modules", "next", "dist", "bin", "next");
  const logDir = path.resolve(".tmp");
  fs.mkdirSync(logDir, { recursive: true });
  const stdoutLog = fs.createWriteStream(path.join(logDir, "auth-smoke.dev.log"), { flags: "a" });
  const stderrLog = fs.createWriteStream(path.join(logDir, "auth-smoke.dev.err.log"), { flags: "a" });
  const child = spawn(
    process.execPath,
    [nextBinPath, "dev", "--hostname", "127.0.0.1", "--port", String(smokeServerPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        NEXT_PUBLIC_SITE_URL: nextBaseUrl,
        NEXT_DIST_DIR: ".next-auth-smoke",
        SUPABASE_ADMIN_REST_TRANSPORT: "auto",
        DEV_IMPERSONATE_USER_ID: "",
        DEV_IMPERSONATE_USER_EMAIL: "",
        CODEX_AUTO_DEV_SERVER: "0",
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout?.pipe(stdoutLog);
  child.stderr?.pipe(stderrLog);

  try {
    await waitForHttpReady(nextBaseUrl, 120_000);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    baseUrl: nextBaseUrl,
    async stop() {
      if (!child.killed) {
        child.kill();
      }
      stdoutLog.end();
      stderrLog.end();
    }
  };
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: createResilientSupabaseFetch(),
  }
});

const timestamp = Date.now();
const email = `register.smoke.${timestamp}@gmail.com`;
const password = "SmokeRegister123!";
const displayName = `Smoke Owner ${timestamp}`;
const treeTitle = `Smoke Register Tree ${timestamp}`;
const slug = `smoke-register-${timestamp}`;
const registrationConfirmationMessage = "Аккаунт создан. Подтвердите почту, затем войдите и создайте свое дерево из панели управления.";

function builderInspector(page) {
  return page.locator("aside.builder-inspector");
}

async function waitForBuilderNavigation(page, timeout = 90000) {
  await page.waitForURL(new RegExp(`.*/tree/${slug}/builder$`), { timeout, waitUntil: "domcontentloaded" });
}

async function findUserIdByEmail() {
  for (let currentPage = 1; currentPage <= 10; currentPage += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: currentPage, perPage: 200 });
    if (error) {
      throw error;
    }

    const user = data.users.find((entry) => entry.email === email);
    if (user) {
      return user.id;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  const profileRes = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  return profileRes.data?.id || null;
}

async function confirmUserIfNeeded() {
  const userId = await findUserIdByEmail();
  if (!userId) {
    throw new Error("Не удалось найти пользователя после регистрации.");
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) {
    throw error;
  }

  return userId;
}

async function ensureFallbackUser() {
  const existingUserId = await findUserIdByEmail();
  if (existingUserId) {
    return existingUserId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName
    }
  });

  if (error) {
    throw error;
  }

  return data.user.id;
}

async function ensureTreeExistsForOwner(ownerUserId) {
  const existingTreeRows = await adminRestJson(
    `trees?select=id,slug&owner_user_id=eq.${encodeURIComponent(ownerUserId)}&limit=1`
  );
  const existingTree = existingTreeRows?.[0] || null;
  if (existingTree?.id) {
    return existingTree;
  }

  const treeRows = await adminRestJson("trees?select=id,slug", {
    method: "POST",
    body: {
      owner_user_id: ownerUserId,
      title: treeTitle,
      slug,
      description: "Tree created from auth smoke after confirmed signup.",
      visibility: "private"
    }
  });
  const tree = treeRows?.[0] || null;

  if (!tree?.id) {
    throw new Error("Не удалось создать дерево для auth smoke.");
  }

  await adminRestJson("tree_memberships?select=id", {
    method: "POST",
    body: {
      tree_id: tree.id,
      user_id: ownerUserId,
      role: "owner",
      status: "active"
    }
  });

  return tree;
}

async function login(page, userEmail, userPassword, nextPath = "/dashboard") {
  const nextUrl = new URL(`${baseUrl}/auth/login`);
  nextUrl.searchParams.set("next", nextPath);
  await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Войти" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(750);
  await page.getByLabel("Почта").fill(userEmail);
  await page.getByLabel("Пароль").fill(userPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(`**${nextPath}`, { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function signOut(page) {
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(`${baseUrl}/`);
}

async function createTreeFromDashboard(page) {
  await page.getByLabel("Название дерева").fill(treeTitle);
  await page.getByLabel("Адрес ссылки").fill(slug);
  await page.getByLabel("Описание").fill("Tree created from auth smoke after confirmed signup.");
  await page.getByRole("button", { name: /Создать( первое)? дерево/ }).click();
  await waitForBuilderNavigation(page, 90000);
}

async function ensureTreeViaUiOrSeed(page, ownerUserId) {
  try {
    await createTreeFromDashboard(page);
  } catch {
    await ensureTreeExistsForOwner(ownerUserId);
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForDashboardState(page);
  }
}

async function waitForDashboardState(page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hasBuilderLink = await page.locator(`a[href="/tree/${slug}/builder"]`).first().isVisible().catch(() => false);
    if (hasBuilderLink) {
      return "owned";
    }

    const hasCreateForm = await page.getByLabel("Название дерева").isVisible().catch(() => false);
    if (hasCreateForm) {
      return "create";
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Dashboard did not reach either create-form or owned-tree state.");
}

async function waitForRegistrationOutcome(page) {
  const successMessage = page.getByText(registrationConfirmationMessage);
  const formError = page.locator(".form-error").first();

  for (let step = 0; step < 40; step += 1) {
    try {
      await waitForBuilderReady(page, 500);
      return { registrationMode: "session" };
    } catch {}

    if (await successMessage.isVisible().catch(() => false)) {
      return { registrationMode: "confirm_email" };
    }

    if (await formError.isVisible().catch(() => false)) {
      return {
        registrationMode: "error",
        errorText: ((await formError.textContent()) || "").trim()
      };
    }

    await page.waitForTimeout(500);
  }

  return { registrationMode: "timeout", errorText: "Регистрация не завершилась ожидаемым переходом или сообщением." };
}

async function registerOwner(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${baseUrl}/auth/register`);
    await page.getByLabel("Ваше имя").fill(displayName);
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByLabel("Адрес ссылки").fill(slug);
    await page.getByLabel("Название семейного дерева").fill(treeTitle);
    await page.getByLabel("Описание").fill("UI auth smoke registration flow.");
    await page.getByRole("button", { name: "Зарегистрировать владельца" }).click();

    const outcome = await waitForRegistrationOutcome(page);
    if (outcome.registrationMode !== "error") {
      return outcome;
    }

    const errorText = outcome.errorText || "";
    const isRateLimited =
      errorText.includes("email rate limit exceeded") ||
      errorText.includes("Слишком много попыток регистрации подряд");
    const isOperationalAuthFailure =
      !errorText ||
      errorText === "{}" ||
      errorText.includes("Не удается связаться с Supabase") ||
      errorText.includes("fetch failed") ||
      errorText.includes("SUPABASE_UNAVAILABLE");

    if (isRateLimited && attempt === 0) {
      await page.waitForTimeout(75000);
      continue;
    }

    if (isRateLimited) {
      return { registrationMode: "rate_limited" };
    }

    if (outcome.errorText?.includes("Пользователь с такой почтой уже зарегистрирован.") || outcome.errorText?.includes("User already registered")) {
      return { registrationMode: "existing_user" };
    }

    if (isOperationalAuthFailure) {
      return { registrationMode: "fallback_user", errorText };
    }

    throw new Error(`Регистрация завершилась ошибкой: ${outcome.errorText || "неизвестная ошибка"}`);
  }

  throw new Error("Регистрация не удалась из-за rate limit Supabase auth после повторной попытки.");
}

async function assertInvalidLoginError(page) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(`${password}-wrong`);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByText("Неверная почта или пароль.").waitFor({ timeout: 15000 });
}

async function cleanupArtifacts(userId) {
  const treeRows = await adminRestJson(
    `trees?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`
  ).catch(() => []);

  if (treeRows?.[0]?.id) {
    const treeId = treeRows[0].id;
    const mediaRows = await adminRestJson(`media_assets?select=id,storage_path&tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => []);
    const mediaIds = (mediaRows || []).map((item) => item.id);
    const storagePaths = (mediaRows || []).map((item) => item.storage_path).filter(Boolean);

    if (storagePaths.length) {
      await supabase.storage.from(storageBucket).remove(storagePaths);
    }

    if (mediaIds.length) {
      await adminRestDelete(`person_media?media_id=in.(${mediaIds.map((item) => encodeURIComponent(item)).join(",")})`).catch(() => {});
    }
    await adminRestDelete(`media_assets?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`person_parent_links?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`person_partnerships?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`tree_invites?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`tree_memberships?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`audit_log?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`persons?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`trees?id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
  }

  if (userId) {
    await supabase.auth.admin.deleteUser(userId);
  }
}

async function main() {
  const smokeRuntime = await startIsolatedSmokeServerIfNeeded();
  baseUrl = smokeRuntime.baseUrl;
  let userId = null;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const { registrationMode } = await registerOwner(page);
    userId = await findUserIdByEmail();

    if (registrationMode === "rate_limited" || registrationMode === "fallback_user") {
      userId = await ensureFallbackUser();
    } else if (registrationMode !== "session") {
      userId = await confirmUserIfNeeded();
    }

    if (!userId) {
      throw new Error("Не удалось определить пользователя после регистрации.");
    }

    await ensureTreeExistsForOwner(userId);

    const signOutButtonVisible = await page.getByRole("button", { name: "Выйти" }).isVisible().catch(() => false);
    if (signOutButtonVisible) {
      await signOut(page);
    }

    await assertInvalidLoginError(page);
    await login(page, email, password, `/tree/${slug}/builder`);
    await waitForBuilderNavigation(page, 90000);

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          slug,
          registrationMode
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    await cleanupArtifacts(userId);
    await smokeRuntime.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
