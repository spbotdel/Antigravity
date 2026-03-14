import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Agent } from "undici";

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
const FALLBACK_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND"
]);
if (!adminKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for smoke e2e admin operations.");
}
const smokeHttpAgent = new Agent({
  connect: { timeout: 30_000 },
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});
const supabaseRestBaseUrl = `${supabaseUrl}/rest/v1`;
const defaultSmokeServerPort = Number(env.SMOKE_LOCAL_PORT || 3101);
const NAVIGATION_TIMEOUT_MS = 120_000;

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

function parsePossiblyNoisyJson(rawText) {
  return JSON.parse(sanitizeJsonText(rawText));
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
        dispatcher: smokeHttpAgent,
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
  const nextBaseUrl = `http://localhost:${smokeServerPort}`;
  const nextBinPath = path.resolve("node_modules", "next", "dist", "bin", "next");
  const logDir = path.resolve(".tmp");
  fs.mkdirSync(logDir, { recursive: true });
  const stdoutLog = fs.createWriteStream(path.join(logDir, "smoke-e2e.dev.log"), { flags: "a" });
  const stderrLog = fs.createWriteStream(path.join(logDir, "smoke-e2e.dev.err.log"), { flags: "a" });
  const child = spawn(
    process.execPath,
    [nextBinPath, "dev", "--hostname", "127.0.0.1", "--port", String(smokeServerPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        NEXT_PUBLIC_SITE_URL: nextBaseUrl,
        NEXT_DIST_DIR: ".next-smoke-e2e",
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

function buildInFilter(values) {
  return `(${[...new Set(values.filter(Boolean))].map((value) => encodeURIComponent(String(value))).join(",")})`;
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
  const data = rawText ? parsePossiblyNoisyJson(rawText) : null;

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
    const data = rawText ? parsePossiblyNoisyJson(rawText) : null;
    throw new Error(data?.message || data?.error || `DELETE ${pathWithQuery} failed with ${response.status}`);
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: createResilientSupabaseFetch(),
  },
});

const fixturePath = path.resolve("tests/fixtures/smoke-photo.png");
const timestamp = Date.now();
const slug = `smoke-family-${timestamp}`;
const treeTitle = `Smoke Family ${timestamp}`;
const ownerName = `Smoke Root ${timestamp}`;
const childName = `Smoke Child ${timestamp}`;
const editedChildName = `Smoke Child Edited ${timestamp}`;
const publicPhotoTitle = `Public Smoke Photo ${timestamp}`;
const membersPhotoTitle = `Members Smoke Photo ${timestamp}`;
const adminPhotoTitle = `Admin Smoke Photo ${timestamp}`;

function builderInspector(page) {
  return page.locator("aside.builder-inspector");
}

async function waitForInspectorPerson(page, fullName, timeout = 90_000) {
  await builderInspector(page).locator("h2").filter({ hasText: fullName }).waitFor({ timeout });
}

async function withRetries(label, task, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }
      console.warn(`${label} retry ${attempt}/${attempts - 1}`, error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }

  throw lastError;
}

async function waitForBuilderReady(page) {
  await page.waitForURL(new RegExp(`.*/tree/${slug}/builder$`), { timeout: 90_000, waitUntil: "domcontentloaded" });
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 45_000 });
  await builderInspector(page).waitFor({ timeout: 45_000 });
  await builderInspector(page).locator("h2").waitFor({ timeout: 45_000 });
  await page.getByRole("button", { name: "Инфо", exact: true }).waitFor({ timeout: 45_000 });
}

async function waitForPatchResponse(page, pathFragment, trigger) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes(pathFragment),
    { timeout: 90_000 }
  );
  await trigger();
  await responsePromise;
}

async function createUser(kind) {
  const email = `${kind}.smoke.${timestamp}@example.com`;
  const password = "SmokeTest123!";
  const { data, error } = await withRetries(`createUser:${kind}`, () =>
    supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `Smoke ${kind}` }
    })
  );

  if (error) {
    throw error;
  }

  return { id: data.user.id, email, password };
}

function isOperationalAuthErrorText(errorText) {
  return (
    errorText === "{}" ||
    errorText.includes("Не удается связаться с Supabase") ||
    errorText.includes("fetch failed") ||
    errorText.includes("SUPABASE_UNAVAILABLE")
  );
}

async function provisionTreeForOwner(ownerUserId) {
  const treeRows = await adminRestJson("trees?select=id", {
    method: "POST",
    body: {
      owner_user_id: ownerUserId,
      title: treeTitle,
      slug,
      description: "Automated smoke test tree.",
      visibility: "private"
    }
  });
  const treeId = treeRows?.[0]?.id;

  if (!treeId) {
    throw new Error("Не удалось создать дерево для smoke-сценария.");
  }

  await adminRestJson("tree_memberships", {
    method: "POST",
    body: {
      tree_id: treeId,
      user_id: ownerUserId,
      role: "owner",
      status: "active"
    }
  });

  return treeId;
}

async function createPersonRecord(treeId, createdByUserId, input) {
  const rows = await adminRestJson("persons?select=*", {
    method: "POST",
    body: {
      tree_id: treeId,
      full_name: input.fullName,
      gender: input.gender || null,
      birth_date: input.birthDate || null,
      death_date: input.deathDate || null,
      birth_place: input.birthPlace || null,
      death_place: input.deathPlace || null,
      bio: input.bio || null,
      is_living: input.isLiving ?? true,
      created_by: createdByUserId || null
    }
  });

  const person = rows?.[0] || null;
  if (!person?.id) {
    throw new Error(`Failed to seed person ${input.fullName}.`);
  }

  return person;
}

async function updateTreeRootDirect(treeId, rootPersonId) {
  const rows = await adminRestJson(`trees?id=eq.${encodeURIComponent(treeId)}&select=*`, {
    method: "PATCH",
    body: {
      root_person_id: rootPersonId
    }
  });

  if (!rows?.[0]?.id) {
    throw new Error("Failed to update tree root during smoke setup.");
  }
}

async function createMediaRecord(treeId, personId, createdByUserId, input) {
  const mediaId = crypto.randomUUID();
  const mediaRows = await adminRestJson("media_assets?select=*", {
    method: "POST",
    body: {
      id: mediaId,
      tree_id: treeId,
      kind: input.kind || "photo",
      provider: input.provider || "object_storage",
      visibility: input.visibility,
      storage_path: input.storagePath || null,
      external_url: input.externalUrl || null,
      title: input.title,
      caption: input.caption || null,
      mime_type: input.mimeType || null,
      size_bytes: input.sizeBytes || null,
      created_by: createdByUserId || null
    }
  });
  const media = mediaRows?.[0] || null;
  if (!media?.id) {
    throw new Error(`Failed to seed media ${input.title}.`);
  }

  await adminRestJson("person_media?select=*", {
    method: "POST",
    body: {
      person_id: personId,
      media_id: media.id,
      is_primary: Boolean(input.isPrimary)
    }
  });

  return media;
}

function hashInviteToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createInviteRecord(treeId, createdByUserId, input) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const rows = await adminRestJson("tree_invites?select=*", {
    method: "POST",
    body: {
      tree_id: treeId,
      email: input.email || null,
      role: input.role,
      invite_method: input.inviteMethod || "email",
      token_hash: hashInviteToken(token),
      expires_at: new Date(Date.now() + (input.expiresInDays || 7) * 24 * 60 * 60 * 1000).toISOString(),
      created_by: createdByUserId || null
    }
  });
  const invite = rows?.[0] || null;
  if (!invite?.id) {
    throw new Error(`Failed to seed invite for ${input.email || input.role}.`);
  }

  return {
    invite,
    token,
    url: `${baseUrl}/auth/accept-invite?token=${token}`
  };
}

async function seedSmokeTreeData(treeId, ownerUserId, adminUserId) {
  const rootPerson = await createPersonRecord(treeId, ownerUserId, {
    fullName: ownerName,
    gender: "male",
    birthDate: "1955-05-05",
    birthPlace: "Moscow",
    bio: "Automated owner root profile.",
    isLiving: true
  });

  await updateTreeRootDirect(treeId, rootPerson.id);

  await createMediaRecord(treeId, rootPerson.id, ownerUserId, {
    title: publicPhotoTitle,
    caption: `${publicPhotoTitle} caption`,
    visibility: "public",
    storagePath: `smoke/${treeId}/public-photo-${Date.now()}.png`,
    mimeType: "image/png",
    sizeBytes: 1024,
    isPrimary: true
  });

  await createMediaRecord(treeId, rootPerson.id, ownerUserId, {
    title: membersPhotoTitle,
    caption: `${membersPhotoTitle} caption`,
    visibility: "members",
    storagePath: `smoke/${treeId}/members-photo-${Date.now()}.png`,
    mimeType: "image/png",
    sizeBytes: 1024
  });

  await createMediaRecord(treeId, rootPerson.id, adminUserId, {
    title: adminPhotoTitle,
    caption: `${adminPhotoTitle} caption`,
    visibility: "members",
    storagePath: `smoke/${treeId}/admin-photo-${Date.now()}.png`,
    mimeType: "image/png",
    sizeBytes: 1024
  });
}

async function deleteUserWithRetry(userId) {
  await withRetries(`deleteUser:${userId}`, async () => {
    const result = await supabase.auth.admin.deleteUser(userId);
    if (result.error) {
      throw result.error;
    }
    return result;
  });
}

async function login(page, email, password, nextPath = "/dashboard") {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const nextUrl = new URL(`${baseUrl}/auth/login`);
    nextUrl.searchParams.set("next", nextPath);
    await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.getByRole("button", { name: "Войти" }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(750);
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();

    try {
      await page.waitForURL(`**${nextPath}`, { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;
      const errorText = ((await page.locator(".form-error").first().textContent().catch(() => "")) || "").trim();
      if (attempt === 3 || !isOperationalAuthErrorText(errorText)) {
        throw error;
      }
      console.warn(`login retry ${attempt}/2`, errorText || "transient auth failure");
      await page.waitForTimeout(attempt * 3000);
    }
  }

  throw lastError;
}

async function createPerson(page, values) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Инфо", exact: true }).click();
  if (!values.preserveContext) {
    const createButton = inspector.getByRole("button", { name: "Новый человек", exact: true });
    const emptyCanvasCreateButton = page.locator(".tree-canvas-empty-action");

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
    } else if (await emptyCanvasCreateButton.isVisible().catch(() => false)) {
      await emptyCanvasCreateButton.click();
    }
  }
  const createSection = inspector.locator("section.builder-panel-stack");
  await createSection.locator('input[name="fullName"]').fill(values.fullName);
  if (values.gender) {
    await createSection.locator('select[name="gender"]').selectOption(values.gender);
  }
  await createSection.locator('input[name="birthDate"]').fill(values.birthDate);
  await createSection.locator('input[name="birthPlace"]').fill(values.birthPlace);
  await createSection.locator('textarea[name="bio"]').fill(values.bio);
  if (!values.isLiving) {
    await createSection.locator('input[name="isLiving"]').uncheck();
  }
  await createSection.getByRole("button", { name: values.submitLabel || "Добавить человека" }).click();
  await waitForInspectorPerson(page, values.fullName);
}

async function startRelativeCreateFromCanvas(page, label) {
  const canvas = page.locator(".tree-canvas");
  await canvas.getByRole("button", { name: "Открыть меню добавления связи" }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function createRelatedPersonInline(page, values) {
  const inspector = builderInspector(page);
  await inspector.locator('input[name="fullName"]').waitFor({ timeout: 90_000 });
  await inspector.locator('input[name="fullName"]').fill(values.fullName);
  await inspector.locator('input[name="birthPlace"]').fill(values.birthPlace);
  if (values.gender) {
    await inspector.locator('select[name="gender"]').selectOption(values.gender);
  }
  if (values.birthDate) {
    await inspector.locator('input[name="birthDate"]').fill(values.birthDate);
  }
  await inspector.getByRole("button", { name: "Сохранить", exact: true }).click();
  await waitForInspectorPerson(page, values.fullName);
}

async function updateSelectedPersonInline(page, values) {
  const inspector = builderInspector(page);
  if (values.fullName !== undefined) {
    await inspector.locator('input[name="fullName"]').fill(values.fullName);
  }
  if (values.birthPlace !== undefined) {
    await inspector.locator('input[name="birthPlace"]').fill(values.birthPlace);
  }
  if (values.gender !== undefined) {
    await inspector.locator('select[name="gender"]').selectOption(values.gender);
  }
  await inspector.getByRole("button", { name: "Сохранить", exact: true }).click();
  if (values.fullName) {
    await waitForInspectorPerson(page, values.fullName);
  }
}

async function addRelationship(page) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Инфо", exact: true }).click();
  await inspector.locator(".builder-relation-card").filter({ hasText: ownerName }).first().waitFor({ timeout: 30000 });
}

async function configureTree(page) {
  await page.goto(`${baseUrl}/tree/${slug}/settings`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.getByLabel("Корневой человек").selectOption({ label: ownerName });
  await waitForPatchResponse(page, "/api/trees/", async () => {
    await page.getByRole("button", { name: "Сохранить данные" }).click();
  });
  await page.getByLabel("Корневой человек").locator("option:checked").filter({ hasText: ownerName }).waitFor({ timeout: 30_000 });
}

async function uploadMediaFile(page, title, visibility) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await waitForBuilderReady(page);
  await page.getByRole("button", { name: new RegExp(ownerName) }).first().click();
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Фото", exact: true }).click();
  const photoForm = inspector.locator("form").nth(0);
  await photoForm.getByLabel("Фотографии с устройства").setInputFiles(fixturePath);
  await photoForm.getByLabel("Подпись").fill(`${title} caption`);
  await photoForm.getByLabel("Видимость").selectOption(visibility);
  await photoForm.getByRole("button", { name: "Проверить фото перед загрузкой" }).click();
  const reviewDialog = page.getByRole("dialog", { name: "Проверка файлов перед загрузкой" });
  await reviewDialog.waitFor({ timeout: 30_000 });
  await reviewDialog.getByRole("button", { name: "Сохранить 1" }).click();
  await inspector.getByRole("heading", { name: title, exact: true }).first().waitFor({ timeout: 30000 });
}

async function createInvite(page, role, email, options = {}) {
  if (options.navigate !== false) {
    await page.goto(`${baseUrl}/tree/${slug}/members`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  }
  await page.getByLabel("Роль").selectOption(role);
  await page.getByLabel("Способ приглашения").selectOption("email");
  await page.locator('input[name="email"]').fill(email);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/invites"),
    { timeout: 90_000 }
  );
  await page.getByRole("button", { name: "Создать приглашение" }).click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Invite creation failed: ${payload.error || response.status}`);
  }
  const success = page.locator(".inline-feedback-card-success").filter({ hasText: "Приглашение готово" });
  try {
    await success.waitFor({ timeout: 45_000 });
  } catch {
    const errorText = ((await page.locator(".form-error").first().textContent().catch(() => "")) || "").trim();
    throw new Error(`Invite creation failed: ${errorText || "success card did not appear"}`);
  }
  const inviteUrl = ((await success.locator("p").filter({ hasText: "/auth/accept-invite" }).textContent()) || "").trim();
  await success.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await page.getByText("Ссылка приглашения скопирована.").waitFor({ timeout: 30_000 });
  const clipboardValue = await page.evaluate(async () => navigator.clipboard.readText());
  if (clipboardValue.trim() !== inviteUrl) {
    throw new Error(`Invite clipboard mismatch: expected ${inviteUrl}, got ${clipboardValue}`);
  }
  return inviteUrl;
}

async function revokeInvite(page, email, options = {}) {
  if (options.navigate !== false) {
    await page.goto(`${baseUrl}/tree/${slug}/members`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  }
  const invitesSection = page.locator("section").filter({ hasText: "Что уже отправлено" }).last();
  const inviteCard = invitesSection.locator(".members-entry-card").filter({ hasText: email }).first();
  await inviteCard.waitFor({ timeout: 30000 });
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes("/api/invites/"),
    { timeout: 90_000 }
  );
  await inviteCard.getByRole("button", { name: "Отозвать приглашение", exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Invite revoke failed: ${payload.error || response.status}`);
  }
  await inviteCard.waitFor({ state: "detached", timeout: 90_000 });
}

async function expectInviteAbsent(page, email) {
  const invitesSection = page.locator("section").filter({ hasText: "Что уже отправлено" }).last();
  await page.waitForTimeout(500);
  const inviteCount = await invitesSection.locator(".members-entry-card").filter({ hasText: email }).count();
  if (inviteCount !== 0) {
    throw new Error(`Invite card still visible after revoke for ${email}.`);
  }
}

async function createShareLink(page, treeId, label, options = {}) {
  if (options.navigate !== false) {
    await page.goto(`${baseUrl}/tree/${slug}/members`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  }
  await page.locator('input[name="label"]').fill(label);
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/share-links"),
    { timeout: 90_000 }
  );
  await page.getByRole("button", { name: "Создать ссылку для просмотра" }).click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Share link creation failed: ${payload?.error || response.status}`);
  }

  const success = page.locator(".inline-feedback-card-success").filter({ hasText: "Ссылка готова" });
  try {
    await success.waitFor({ timeout: 45_000 });
  } catch {
    const errorText = ((await page.locator(".form-error").first().textContent().catch(() => "")) || "").trim();
    throw new Error(`Share link creation failed: ${errorText || "success card did not appear"}`);
  }

  const shareUrl = ((await success.locator("p").filter({ hasText: "/tree/" }).textContent()) || "").trim();
  await success.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await page.getByText("Семейная ссылка скопирована.").waitFor({ timeout: 30_000 });
  const clipboardValue = await page.evaluate(async () => navigator.clipboard.readText());
  if (clipboardValue.trim() !== shareUrl) {
    throw new Error(`Share link clipboard mismatch: expected ${shareUrl}, got ${clipboardValue}`);
  }

  await page.locator(".members-entry-card").filter({ hasText: label }).first().waitFor({ timeout: 90_000 });
  return payload;
}

async function revealExistingShareLink(page, label, expectedUrl) {
  const shareListSection = page.locator("section").filter({ hasText: "Ссылки для семейного просмотра" }).last();
  const shareCard = shareListSection.locator(".members-entry-card").filter({ hasText: label }).first();
  await shareCard.waitFor({ timeout: 30_000 });

  const revealResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "GET" && response.url().includes("/api/share-links/"),
    { timeout: 90_000 }
  );
  await shareCard.getByRole("button", { name: "Показать ссылку", exact: true }).click();
  const revealResponse = await revealResponsePromise;
  const revealPayload = await revealResponse.json().catch(() => ({}));
  if (!revealResponse.ok) {
    throw new Error(`Share link reveal failed: ${revealPayload?.error || revealResponse.status}`);
  }

  const revealedUrl = ((await shareCard.locator("p").filter({ hasText: "/tree/" }).last().textContent()) || "").trim();
  if (revealedUrl !== expectedUrl) {
    throw new Error(`Share link reveal mismatch: expected ${expectedUrl}, got ${revealedUrl}`);
  }

  await shareCard.getByRole("button", { name: "Скопировать", exact: true }).click();
  await page.getByText("Семейная ссылка скопирована.").waitFor({ timeout: 30_000 });
  const clipboardValue = await page.evaluate(async () => navigator.clipboard.readText());
  if (clipboardValue.trim() !== expectedUrl) {
    throw new Error(`Revealed share link clipboard mismatch: expected ${expectedUrl}, got ${clipboardValue}`);
  }
}

async function revokeShareLink(page, shareLinkId, label, options = {}) {
  if (options.navigate !== false) {
    await page.goto(`${baseUrl}/tree/${slug}/members`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  }
  const shareListSection = page.locator("section").filter({ hasText: "Ссылки для семейного просмотра" }).last();
  const shareCard = shareListSection.locator(".members-entry-card").filter({ hasText: label }).first();
  await shareCard.waitFor({ timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes(`/api/share-links/${shareLinkId}`),
    { timeout: 90_000 }
  );
  await shareCard.getByRole("button", { name: "Отозвать ссылку", exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Share link revoke failed: ${payload?.error || response.status}`);
  }

  await shareCard.getByText("Отозвана").first().waitFor({ timeout: 90_000 });
}

async function acceptInvite(browser, user, inviteUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const normalizedInviteUrl = inviteUrl.replace("http://localhost:3000", baseUrl);
  const inviteUrlObject = new URL(normalizedInviteUrl);
  const invitePath = inviteUrlObject.pathname + inviteUrlObject.search;
  const token = inviteUrlObject.searchParams.get("token") || "";
  await login(page, user.email, user.password, invitePath);
  await page.getByRole("button", { name: "Принять приглашение" }).waitFor({ timeout: 30_000 });
  const acceptResult = await page.evaluate(async (inviteToken) => {
    const response = await fetch("/api/invites/accept", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ token: inviteToken })
    });
    const rawText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      rawText
    };
  }, token);
  let payload = {};
  if (acceptResult.rawText) {
    try {
      payload = parsePossiblyNoisyJson(acceptResult.rawText);
    } catch {
      payload = {
        error: acceptResult.rawText.slice(0, 300)
      };
    }
  }
  if (!acceptResult.ok) {
    throw new Error(`Invite accept failed: ${payload?.error || acceptResult.status}`);
  }
  await page.goto(`${baseUrl}/tree/${payload.slug}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForURL(new RegExp(`.*/tree/${slug}(\\?.*)?$`), { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "domcontentloaded" });
  return { context, page };
}

async function waitForBuilderAccess(page) {
  await withRetries("builder-access", async () => {
    await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    if (!page.url().includes(`/tree/${slug}/builder`)) {
      throw new Error(`Expected builder URL, got ${page.url()}`);
    }
    await waitForBuilderReady(page);
  }, 4);
}

async function assertPrivateTreeBlocked(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/tree/${slug}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.getByRole("heading", { name: "Дерево недоступно" }).waitFor();
  await context.close();
}

async function assertShareLinkVisibility(browser, shareUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const normalizedShareUrl = shareUrl.replace("http://localhost:3000", baseUrl);
  await page.goto(normalizedShareUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.locator(".person-media-thumb").nth(0).waitFor({ timeout: 90_000 });
  await page.locator(".person-media-thumb").nth(1).waitFor({ timeout: 90_000 });
  await page.locator(".person-media-thumb").nth(2).waitFor({ timeout: 90_000 });
  const builderLinks = await page.getByRole("link", { name: "Конструктор", exact: true }).count();
  if (builderLinks !== 0) {
    throw new Error("Получатель семейной ссылки видит ссылку на конструктор.");
  }
  await context.close();
}

async function assertRevokedShareLinkBlocked(browser, shareUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const normalizedShareUrl = shareUrl.replace("http://localhost:3000", baseUrl);
  await page.goto(normalizedShareUrl, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.getByRole("heading", { name: "Дерево недоступно" }).waitFor();
  await context.close();
}

async function verifyDbState(ownerEmail, adminEmail, viewerEmail) {
  const treeRows = await adminRestJson(
    `trees?select=id,slug,visibility,title&slug=eq.${encodeURIComponent(slug)}&limit=1`
  );
  const tree = treeRows?.[0] || null;
  if (!tree?.id) {
    throw new Error("Не удалось найти дерево для проверки.");
  }

  const [mediaRows, profileRows, shareLinkRows] = await Promise.all([
    adminRestJson(`media_assets?select=id,title,visibility,kind&tree_id=eq.${encodeURIComponent(tree.id)}`),
    adminRestJson(`profiles?select=email&email=in.${buildInFilter([ownerEmail, adminEmail, viewerEmail])}`),
    adminRestJson(`tree_share_links?select=id,revoked_at&tree_id=eq.${encodeURIComponent(tree.id)}`)
  ]);

  return {
    tree,
    mediaCount: mediaRows.length,
    profileCount: profileRows.length,
    shareLinkCount: shareLinkRows.length,
    revokedShareLinkCount: shareLinkRows.filter((item) => item.revoked_at).length
  };
}

async function cleanupArtifacts(userIds) {
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
      await adminRestDelete(`person_media?media_id=in.${buildInFilter(mediaIds)}`).catch(() => {});
    }

    await Promise.allSettled([
      adminRestDelete(`media_assets?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`person_parent_links?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`person_partnerships?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`tree_share_links?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`tree_invites?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`tree_memberships?tree_id=eq.${encodeURIComponent(treeId)}`),
      adminRestDelete(`audit_log?tree_id=eq.${encodeURIComponent(treeId)}`),
    ]);

    await adminRestDelete(`persons?tree_id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
    await adminRestDelete(`trees?id=eq.${encodeURIComponent(treeId)}`).catch(() => {});
  }

  await Promise.allSettled(
    userIds.filter(Boolean).map(async (userId) => {
      try {
        await deleteUserWithRetry(userId);
      } catch (error) {
        console.warn(`cleanup warning: failed to delete user ${userId}`, error);
      }
    })
  );
}

async function main() {
  const smokeRuntime = await startIsolatedSmokeServerIfNeeded();
  baseUrl = smokeRuntime.baseUrl;
  const owner = await createUser("owner");
  const admin = await createUser("admin");
  const viewer = await createUser("viewer");
  const createdUserIds = [owner.id, admin.id, viewer.id];
  const treeId = await provisionTreeForOwner(owner.id);
  await seedSmokeTreeData(treeId, owner.id, admin.id);
  const viewerInvite = await createInviteRecord(treeId, owner.id, {
    email: viewer.email,
    role: "viewer",
    inviteMethod: "email",
    expiresInDays: 7
  });
  const revokedPendingInviteEmail = `revoked.pending.${timestamp}@example.com`;
  await createInviteRecord(treeId, owner.id, {
    email: revokedPendingInviteEmail,
    role: "viewer",
    inviteMethod: "email",
    expiresInDays: 7
  });

  const browser = await chromium.launch({ headless: true });

  try {
    const ownerContext = await browser.newContext();
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, owner.email, owner.password, "/dashboard");
    await waitForBuilderAccess(ownerPage);
    await waitForInspectorPerson(ownerPage, ownerName);

    await ownerPage.goto(`${baseUrl}/tree/${slug}/members`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    const adminInvite = await createInvite(ownerPage, "admin", admin.email, { navigate: false });
    await revokeInvite(ownerPage, revokedPendingInviteEmail, { navigate: false });

    const adminSession = await acceptInvite(browser, admin, adminInvite);
    await waitForBuilderAccess(adminSession.page);
    await waitForInspectorPerson(adminSession.page, ownerName);
    await adminSession.context.close();

    const viewerSession = await acceptInvite(browser, viewer, viewerInvite.url);
    await viewerSession.page.locator(".person-media-thumb").nth(0).waitFor({ timeout: 90_000 });
    await viewerSession.page.locator(".person-media-thumb").nth(1).waitFor({ timeout: 90_000 });
    await viewerSession.page.locator(".person-media-thumb").nth(2).waitFor({ timeout: 90_000 });
    await viewerSession.page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await viewerSession.page.waitForURL(`**/tree/${slug}`, { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    await viewerSession.context.close();

    const shareResult = await createShareLink(ownerPage, treeId, `Smoke Share ${timestamp}`, { navigate: false });
    const shareUrl = shareResult.url;
    await revealExistingShareLink(ownerPage, shareResult.shareLink.label, shareUrl);
    await assertPrivateTreeBlocked(browser);
    await assertShareLinkVisibility(browser, shareUrl);
    await revokeShareLink(ownerPage, shareResult.shareLink.id, shareResult.shareLink.label, { navigate: false });
    await assertRevokedShareLinkBlocked(browser, shareUrl);

    const dbState = await verifyDbState(owner.email, admin.email, viewer.email);

    console.log(
      JSON.stringify(
        {
          ok: true,
          slug,
          users: { owner: owner.email, admin: admin.email, viewer: viewer.email },
          dbState
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    try {
      await cleanupArtifacts(createdUserIds);
    } catch (error) {
      console.warn("cleanup warning: smoke artifacts were not fully removed", error);
    }
    await smokeRuntime.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
