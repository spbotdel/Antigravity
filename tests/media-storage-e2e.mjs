import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

import { chromium } from "@playwright/test";

function parseCliOptions(argv) {
  const options = {
    forceProxyUpload: true,
    forceProxyUploadSpecified: false,
  };

  for (const argument of argv) {
    if (argument.startsWith("--force-proxy=")) {
      const rawValue = argument.slice("--force-proxy=".length).trim().toLowerCase();
      options.forceProxyUploadSpecified = true;
      options.forceProxyUpload = !(rawValue === "false" || rawValue === "0" || rawValue === "no");
    }
  }

  return options;
}

function readEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

const env = readEnv(path.resolve(".env.local"));
const cliOptions = parseCliOptions(process.argv.slice(2));
const baseUrlOverride = process.env.SMOKE_BASE_URL?.trim() || null;
let baseUrl = baseUrlOverride || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const hostedLoginEmail = process.env.SMOKE_LOGIN_EMAIL?.trim() || null;
const hostedLoginPassword = process.env.SMOKE_LOGIN_PASSWORD?.trim() || null;
const mediaStorageBackend = env.MEDIA_STORAGE_BACKEND || "supabase";
const cloudflareRolloutAt = env.CF_R2_ROLLOUT_AT ? Date.parse(env.CF_R2_ROLLOUT_AT) : null;
const shouldUseCloudflareForNewMedia =
  mediaStorageBackend === "cloudflare_r2" &&
  (cloudflareRolloutAt === null ? !env.CF_R2_ROLLOUT_AT : Number.isFinite(cloudflareRolloutAt) && Date.now() >= cloudflareRolloutAt);
const expectedObjectStorageHost =
  shouldUseCloudflareForNewMedia
    ? new URL(env.CF_R2_ENDPOINT || `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`).host
    : "storage.yandexcloud.net";
const slug = process.env.SMOKE_TREE_SLUG?.trim() || "test-tree";
const fixturePath = path.resolve("tests/fixtures/smoke-photo.png");
const artifactDir = path.resolve("tests/artifacts");
const timestamp = Date.now();
const screenshotPath = path.join(artifactDir, `media-storage-e2e-${timestamp}.png`);
const reportPath = path.join(artifactDir, `media-storage-report-${timestamp}.json`);
const defaultSmokeServerPort = Number(env.SMOKE_LOCAL_PORT || 3103);
const photoTitle = `Device Photo ${timestamp}`;
const storageVideoTitle = `Device Video ${timestamp}`;
const externalVideoTitle = `External Video ${timestamp}`;
const uploadedPhotoRecordTitle = "smoke-photo.png";
const uploadedStorageVideoRecordTitle = "smoke-video.webm";
const externalVideoUrl = `https://example.com/family-video-${timestamp}`;
const expectedConfiguredBackend = mediaStorageBackend;
const expectedResolvedUploadBackend =
  mediaStorageBackend === "cloudflare_r2"
    ? shouldUseCloudflareForNewMedia
      ? "cloudflare_r2"
      : "object_storage"
    : mediaStorageBackend;
const expectedRolloutState =
  mediaStorageBackend !== "cloudflare_r2"
    ? "steady_state"
    : shouldUseCloudflareForNewMedia
      ? "cloudflare_rollout_active"
      : "cloudflare_rollout_gated";
const expectedForceProxyUpload =
  baseUrlOverride && !cliOptions.forceProxyUploadSpecified
    ? false
    : cliOptions.forceProxyUpload;
const expectedUploadMode =
  expectedResolvedUploadBackend === "cloudflare_r2" && !expectedForceProxyUpload
    ? "direct"
    : "proxy";

function shouldUseHostedAuthenticatedSession() {
  return Boolean(baseUrlOverride && hostedLoginEmail && hostedLoginPassword);
}

function buildExpectedTransportHint(options = {}) {
  const { hasServerSideVariants = false } = options;

  if (expectedConfiguredBackend !== "cloudflare_r2") {
    return null;
  }

  if (expectedRolloutState === "cloudflare_rollout_gated") {
    return "Cloudflare R2 уже настроен, но rollout еще не активен: новые файлы пока идут через текущий object storage path.";
  }

  if (expectedRolloutState !== "cloudflare_rollout_active") {
    return null;
  }

  if (expectedUploadMode === "direct") {
    return hasServerSideVariants
      ? "Cloudflare R2 активен: оригинал уходит напрямую в R2, а preview-варианты догружаются через сервер."
      : "Cloudflare R2 активен: файл уходит напрямую в R2.";
  }

  if (expectedForceProxyUpload) {
    return "Cloudflare R2 активен, но этот запуск принудительно использует серверный proxy upload.";
  }

  return "Cloudflare R2 активен, но этот запуск использует серверный proxy upload.";
}

function parsePossiblyNoisyJson(rawText) {
  const withoutBom = rawText.replace(/^\uFEFF/, "");
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

async function withRetries(label, task, attempts = 3, options = {}) {
  const { logRetries = false } = options;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      if (logRetries) {
        console.warn(`${label} retry ${attempt}/${attempts - 1}`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError;
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

  throw new Error(`Timed out waiting for media smoke server at ${url}`);
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

async function startIsolatedMediaSmokeServer() {
  if (baseUrlOverride) {
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
  const stdoutLog = fs.createWriteStream(path.join(logDir, "media-smoke.dev.log"), { flags: "a" });
  const stderrLog = fs.createWriteStream(path.join(logDir, "media-smoke.dev.err.log"), { flags: "a" });
  const child = spawn(
    process.execPath,
    [nextBinPath, "dev", "--hostname", "127.0.0.1", "--port", String(smokeServerPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        NEXT_PUBLIC_SITE_URL: nextBaseUrl,
        NEXT_DIST_DIR: ".next-media-smoke",
        SUPABASE_ADMIN_REST_TRANSPORT: "powershell",
        MEDIA_UPLOAD_FORCE_PROXY: expectedForceProxyUpload ? "true" : "false",
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

async function startMediaSmokeRuntime() {
  const shouldReuseExistingDevServer = !expectedForceProxyUpload && expectedResolvedUploadBackend === "cloudflare_r2";

  if (shouldReuseExistingDevServer) {
    await waitForHttpReady(baseUrl, 120_000);
    return {
      baseUrl,
      async stop() {},
    };
  }

  return startIsolatedMediaSmokeServer();
}

async function login(page, userEmail, userPassword, nextPath = "/dashboard") {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const nextUrl = new URL(`${baseUrl}/auth/login`);
    nextUrl.searchParams.set("next", nextPath);
    await page.goto(nextUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("button", { name: "Войти" }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(750);
    await page.getByLabel("Почта").fill(userEmail);
    await page.getByLabel("Пароль").fill(userPassword);
    await page.getByRole("button", { name: "Войти" }).click();

    try {
      await page.waitForURL(`**${nextPath}`, { timeout: 90_000, waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;
      const errorText = ((await page.locator(".form-error").first().textContent().catch(() => "")) || "").trim();
      const isOperationalAuthFailure =
        errorText === "{}" ||
        errorText.includes("Не удается связаться с Supabase") ||
        errorText.includes("fetch failed") ||
        errorText.includes("SUPABASE_UNAVAILABLE");
      if (attempt === 3 || !isOperationalAuthFailure) {
        throw error;
      }
      console.warn(`media smoke login retry ${attempt}/2`, errorText || "transient auth failure");
      await page.waitForTimeout(attempt * 3000);
    }
  }

  throw lastError;
}

async function performRequest(input) {
  const url = new URL(input.path, baseUrl).toString();

  if (input.requestContext) {
    const response = await input.requestContext.fetch(url, {
      method: input.method || "GET",
      headers: input.headers,
      data: input.body,
      failOnStatusCode: false,
      maxRedirects: 0,
    });

    return {
      status: response.status(),
      text: await response.text(),
      headers: response.headers(),
    };
  }

  const response = await fetch(url, {
    method: input.method || "GET",
    headers: input.headers,
    body: input.body,
    cache: "no-store",
    redirect: "manual",
  });

  return {
    status: response.status,
    text: await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function requestJson(pathname, options = {}) {
  const response = await performRequest({
    path: pathname,
    method: options.method,
    headers: options.headers,
    body: options.body,
    requestContext: options.requestContext,
  });
  let parsed = null;
  if (response.text) {
    try {
      parsed = parsePossiblyNoisyJson(response.text);
    } catch {
      throw new Error(`Failed to parse JSON from ${pathname}: ${response.text.slice(0, 300)}`);
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(parsed?.error || `${options.method || "GET"} ${pathname} failed with ${response.status}`);
  }

  return parsed;
}

function builderInspector(page) {
  return page.locator(".builder-inspector");
}

function getBuilderTabControl(root, label) {
  return root
    .getByRole("tab", { name: label, exact: true })
    .or(root.getByRole("button", { name: label, exact: true }))
    .first();
}

function getVisibilityChoice(value) {
  if (value === "members") {
    return { value, label: "Только членам семьи" };
  }

  return { value: "public", label: "Всем по ссылке" };
}

async function setLabeledSelectValue(page, root, fieldLabel, choice) {
  const field = root.getByLabel(fieldLabel);
  await field.waitFor({ timeout: 30_000 });
  const tagName = await field.evaluate((element) => element.tagName.toLowerCase());

  if (tagName === "select") {
    if (choice.value !== undefined) {
      await field.selectOption(choice.value);
    } else {
      await field.selectOption({ label: choice.label });
    }
    return;
  }

  await field.click();
  await page.getByRole("option", { name: choice.label, exact: true }).click();
}

async function postJson(pathname, payload, requestContext) {
  return requestJson(pathname, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    requestContext,
  });
}

async function createExternalVideoViaApi(treeId, personId, requestContext) {
  await postJson("/api/media/complete", {
    treeId,
    personId,
    mediaId: crypto.randomUUID(),
    provider: "yandex_disk",
    externalUrl: externalVideoUrl,
    visibility: "members",
    title: externalVideoTitle,
    caption: `${externalVideoTitle} caption`
  }, requestContext);
}

async function fetchUploadIntentContracts(treeId, personId, requestContext) {
  const photoIntent = await postJson("/api/media/upload-intent", {
    treeId,
    personId,
    filename: "rollout-check-photo.jpg",
    mimeType: "image/jpeg",
    visibility: "members",
    title: `Rollout Photo ${timestamp}`,
    caption: ""
  }, requestContext);

  const archiveVideoIntent = await postJson("/api/media/archive/upload-intent", {
    treeId,
    filename: "rollout-check-video.webm",
    mimeType: "video/webm",
    visibility: "members",
    title: `Rollout Video ${timestamp}`,
    caption: ""
  }, requestContext);

  return {
    photoIntent,
    archiveVideoIntent
  };
}

function assertUploadIntentContract(intent, expected) {
  if (intent.configuredBackend !== expected.configuredBackend) {
    throw new Error(`Unexpected configured backend: ${intent.configuredBackend}`);
  }

  if (intent.resolvedUploadBackend !== expected.resolvedUploadBackend) {
    throw new Error(`Unexpected resolved upload backend: ${intent.resolvedUploadBackend}`);
  }

  if (intent.rolloutState !== expected.rolloutState) {
    throw new Error(`Unexpected rollout state: ${intent.rolloutState}`);
  }

  if (intent.forceProxyUpload !== expected.forceProxyUpload) {
    throw new Error(`Unexpected forceProxyUpload flag: ${intent.forceProxyUpload}`);
  }

  if (intent.uploadMode !== expected.uploadMode) {
    throw new Error(`Unexpected upload mode: ${intent.uploadMode}`);
  }

  if (intent.variantUploadMode !== expected.variantUploadMode) {
    throw new Error(`Unexpected variant upload mode: ${intent.variantUploadMode}`);
  }
}

async function waitForBuilderReady(page) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForURL(`**/tree/${slug}/builder`, { timeout: 120000, waitUntil: "domcontentloaded" });
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 45000 });
  await builderInspector(page).waitFor({ timeout: 45000 });
  await builderInspector(page).locator("h2").waitFor({ timeout: 45000 });
}

async function openMediaPanel(page, tabLabel = "Фото") {
  const inspector = builderInspector(page);
  await getBuilderTabControl(inspector, tabLabel).click();
  await inspector.locator("form").nth(0).waitFor({ timeout: 30000 });
}

async function uploadDeviceMediaViaUi(page, options) {
  const {
    tabLabel,
    inputLabel,
    caption,
    files,
  } = options;
  const inspector = builderInspector(page);
  await openMediaPanel(page, tabLabel);
  const storageForm = inspector.locator("form").nth(0);
  await inspector.locator(".builder-media-limits-note").waitFor({ timeout: 15000 });
  await storageForm.getByLabel(inputLabel).setInputFiles(files);
  const reviewDialog = page.getByRole("dialog", { name: "Проверка файлов перед загрузкой" });
  await reviewDialog.waitFor({ timeout: 15000 });
  await reviewDialog.getByLabel("Подпись").fill(caption);
  await setLabeledSelectValue(page, reviewDialog, "Видимость", getVisibilityChoice("members"));
  await reviewDialog.getByRole("button", { name: "Сохранить 1" }).click();
  await reviewDialog.waitFor({ state: "detached", timeout: 30000 });
  await inspector.locator(".builder-media-limits-note").waitFor({ timeout: 15000 });
}

async function uploadDevicePhotoViaUi(page) {
  await uploadDeviceMediaViaUi(page, {
    tabLabel: "Фото",
    inputLabel: "Фотографии с устройства",
    caption: `${photoTitle} caption`,
    files: [
      {
        name: "smoke-photo.png",
        mimeType: "image/png",
        buffer: fs.readFileSync(fixturePath)
      }
    ]
  });
}

async function uploadDeviceVideoViaUi(page) {
  await uploadDeviceMediaViaUi(page, {
    tabLabel: "Видео",
    inputLabel: "Видео с устройства",
    caption: `${storageVideoTitle} caption`,
    files: [
      {
        name: "smoke-video.webm",
        mimeType: "video/webm",
        buffer: Buffer.from("RIFF....WEBMsmoke-video-device-upload")
      }
    ]
  });
}

async function fetchMediaRecords(treeId, options = {}) {
  const {
    expectedTitles = [uploadedPhotoRecordTitle, uploadedStorageVideoRecordTitle, externalVideoTitle],
    requireAllExpected = true,
    expectEmpty = false,
    titlePrefixes = null,
    attempts = null,
    requestContext = null,
  } = options;

  const retryAttempts = attempts ?? (expectEmpty ? 16 : 8);

  return withRetries("builder-snapshot:media", async () => {
    const snapshot = await requestJson(`/api/tree/${slug}/builder-snapshot?includeMedia=1`, {
      requestContext,
    });
    if (!snapshot?.tree?.id || snapshot.tree.id !== treeId) {
      throw new Error("Builder snapshot returned unexpected tree.");
    }

    const allMedia = snapshot.media || [];
    const matched =
      titlePrefixes && titlePrefixes.length
        ? allMedia.filter((item) => titlePrefixes.some((prefix) => typeof item.title === "string" && item.title.startsWith(prefix)))
        : allMedia.filter((item) => expectedTitles.includes(item.title));
    if (expectEmpty) {
      if (matched.length > 0) {
        throw new Error(`Expected media rows to disappear, but still found ${matched.length}.`);
      }
      return matched;
    }

    if (requireAllExpected) {
      const missingTitles = expectedTitles.filter((title) => !matched.some((item) => item.title === title));
      if (missingTitles.length > 0) {
        throw new Error(`Expected media rows are not visible yet: ${missingTitles.join(", ")}`);
      }
    }

    return matched;
  }, retryAttempts);
}

async function assertMediaRedirect(mediaPathOrId, expectedUrlPart, requestContext) {
  const mediaPath = mediaPathOrId.includes("/") || mediaPathOrId.includes("?") ? mediaPathOrId : `/api/media/${mediaPathOrId}`;
  let result;

  if (requestContext) {
    const response = await performRequest({
      path: mediaPath,
      method: "GET",
      requestContext,
    });
    result = {
      status: response.status,
      location: response.headers.location || null,
    };
  } else {
    const url = new URL(mediaPath, baseUrl);
    const transport = url.protocol === "https:" ? https : http;
    result = await new Promise((resolve, reject) => {
      const request = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: "GET"
        },
        (response) => {
          resolve({
            status: response.statusCode || 0,
            location: response.headers.location || null
          });
        }
      );
      request.on("error", reject);
      request.end();
    });
  }

  if (result.status !== 307) {
    throw new Error(`Expected 307 for media ${mediaPath}, got ${result.status}`);
  }

  if (!result.location || !result.location.includes(expectedUrlPart)) {
    throw new Error(`Unexpected redirect for media ${mediaPath}: ${result.location || "<missing>"}`);
  }
}

async function assertViewerShowsMedia(page) {
  await withRetries("viewer", async () => {
    await page.goto(`${baseUrl}/tree/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const gallery = page.locator(".person-media-gallery");
    await gallery.waitFor({ timeout: 60000 });
    const thumbs = gallery.locator(".person-media-thumb");
    await thumbs.nth(0).waitFor({ timeout: 15000 });
    await thumbs.nth(1).waitFor({ timeout: 15000 });
    const externalThumb = thumbs.nth(2);
    await externalThumb.waitFor({ timeout: 15000 });
    await externalThumb.scrollIntoViewIfNeeded();
    await externalThumb.click({ force: true });
    await gallery.locator(".person-media-stage-copy").getByRole("heading", { name: externalVideoTitle, exact: true }).waitFor({ timeout: 45000 });
    await gallery.locator(".person-media-stage-actions").getByRole("link", { name: "Открыть внешнее видео" }).waitFor({ timeout: 45000 });
  }, 3, { logRetries: true });
}

async function cleanupMedia(mediaIds, requestContext) {
  for (const mediaId of mediaIds) {
    try {
      await withRetries(`cleanup:media:${mediaId}`, async () => {
        const response = await performRequest({
          path: `/api/media/${mediaId}`,
          method: "DELETE",
          requestContext,
        });

        if ((response.status >= 200 && response.status < 300) || response.status === 404) {
          return;
        }

        throw new Error(`DELETE ${mediaId} failed with ${response.status}: ${response.text.slice(0, 200)}`);
      }, 4, { logRetries: true });
    } catch (error) {
      console.warn("cleanup warning", mediaId, error);
    }
  }
}

async function cleanupMediaByTitle(treeId, requestContext) {
  const records = await fetchMediaRecords(treeId, { requireAllExpected: false, requestContext });
  await cleanupMedia(records.map((item) => item.id), requestContext);
}

async function cleanupStaleSmokeMedia(treeId, requestContext) {
  const staleRecords = await fetchMediaRecords(treeId, {
    requireAllExpected: false,
    titlePrefixes: ["Device Photo ", "Device Video ", "External Video ", "Device Upload "],
    requestContext,
  });

  if (!staleRecords.length) {
    return;
  }

  await cleanupMedia(staleRecords.map((item) => item.id), requestContext);
}

async function main() {
  const smokeRuntime = await startMediaSmokeRuntime();
  baseUrl = smokeRuntime.baseUrl;
  fs.mkdirSync(artifactDir, { recursive: true });
  let browser = null;
  let context = null;
  let page = null;
  let requestContext = null;
  let treeId = null;
  let report = null;
  let mediaIds = [];
  let failure = null;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1200 }
    });
    page = await context.newPage();

    if (shouldUseHostedAuthenticatedSession()) {
      await login(page, hostedLoginEmail, hostedLoginPassword, `/tree/${slug}/builder`);
      requestContext = context.request;
    }

    const snapshot = await requestJson(`/api/tree/${slug}/builder-snapshot`, {
      requestContext,
    });
    treeId = snapshot.tree.id;
    const personId = snapshot.tree.root_person_id || snapshot.people[0].id;
    report = {
      ok: false,
      slug,
      treeId,
      smokeMode: expectedForceProxyUpload ? "proxy" : "direct",
      photoTitle,
      storageVideoTitle,
      externalVideoTitle,
      verifiedProviders: [],
      uploadIntentContracts: null,
      diagnostics: {
        usedHostedAuthSession: Boolean(requestContext),
      },
      artifacts: {
        reportPath,
        screenshotPath: null
      }
    };

    await cleanupStaleSmokeMedia(treeId, requestContext).catch((error) => {
      console.warn("cleanup warning: cleanupStaleSmokeMedia", error);
    });

    await withRetries("builder:init", async () => {
      await waitForBuilderReady(page);
      await openMediaPanel(page, "Фото");
    });
    const uploadIntentContracts = await fetchUploadIntentContracts(treeId, personId, requestContext);
    assertUploadIntentContract(uploadIntentContracts.photoIntent, {
      configuredBackend: expectedConfiguredBackend,
      resolvedUploadBackend: expectedResolvedUploadBackend,
      rolloutState: expectedRolloutState,
      forceProxyUpload: expectedForceProxyUpload,
      uploadMode: expectedUploadMode,
      variantUploadMode: "server_proxy"
    });
    assertUploadIntentContract(uploadIntentContracts.archiveVideoIntent, {
      configuredBackend: expectedConfiguredBackend,
      resolvedUploadBackend: expectedResolvedUploadBackend,
      rolloutState: expectedRolloutState,
      forceProxyUpload: expectedForceProxyUpload,
      uploadMode: expectedUploadMode,
      variantUploadMode: "none"
    });
    report.uploadIntentContracts = {
      expected: {
        configuredBackend: expectedConfiguredBackend,
        resolvedUploadBackend: expectedResolvedUploadBackend,
        rolloutState: expectedRolloutState,
        forceProxyUpload: expectedForceProxyUpload,
        uploadMode: expectedUploadMode
      },
      photo: {
        configuredBackend: uploadIntentContracts.photoIntent.configuredBackend,
        resolvedUploadBackend: uploadIntentContracts.photoIntent.resolvedUploadBackend,
        rolloutState: uploadIntentContracts.photoIntent.rolloutState,
        forceProxyUpload: uploadIntentContracts.photoIntent.forceProxyUpload,
        uploadMode: uploadIntentContracts.photoIntent.uploadMode,
        variantUploadMode: uploadIntentContracts.photoIntent.variantUploadMode,
        variantTargetCount: Array.isArray(uploadIntentContracts.photoIntent.variantTargets) ? uploadIntentContracts.photoIntent.variantTargets.length : 0
      },
      archiveVideo: {
        configuredBackend: uploadIntentContracts.archiveVideoIntent.configuredBackend,
        resolvedUploadBackend: uploadIntentContracts.archiveVideoIntent.resolvedUploadBackend,
        rolloutState: uploadIntentContracts.archiveVideoIntent.rolloutState,
        forceProxyUpload: uploadIntentContracts.archiveVideoIntent.forceProxyUpload,
        uploadMode: uploadIntentContracts.archiveVideoIntent.uploadMode,
        variantUploadMode: uploadIntentContracts.archiveVideoIntent.variantUploadMode,
        variantTargetCount: Array.isArray(uploadIntentContracts.archiveVideoIntent.variantTargets) ? uploadIntentContracts.archiveVideoIntent.variantTargets.length : 0
      }
    };
    await uploadDevicePhotoViaUi(page);
    await fetchMediaRecords(treeId, {
      expectedTitles: [uploadedPhotoRecordTitle],
      requireAllExpected: true,
      requestContext,
    });
    await uploadDeviceVideoViaUi(page);
    await fetchMediaRecords(treeId, {
      expectedTitles: [uploadedPhotoRecordTitle, uploadedStorageVideoRecordTitle],
      requireAllExpected: true,
      requestContext,
    });
    await createExternalVideoViaApi(treeId, personId, requestContext);

    const mediaRecords = await fetchMediaRecords(treeId, { requestContext });
    const photoRecord = mediaRecords.find((item) => item.title === uploadedPhotoRecordTitle);
    const storageVideoRecord = mediaRecords.find((item) => item.title === uploadedStorageVideoRecordTitle);
    const externalVideoRecord = mediaRecords.find((item) => item.title === externalVideoTitle);

    if (!photoRecord || !storageVideoRecord || !externalVideoRecord) {
      throw new Error("Expected media records were not created.");
    }

    mediaIds = mediaRecords.map((item) => item.id);

    if (photoRecord.provider !== "object_storage" || photoRecord.kind !== "photo" || !photoRecord.storage_path) {
      throw new Error(`Unexpected photo record: ${JSON.stringify(photoRecord)}`);
    }

    if (storageVideoRecord.provider !== "object_storage" || storageVideoRecord.kind !== "video" || !storageVideoRecord.storage_path) {
      throw new Error(`Unexpected storage video record: ${JSON.stringify(storageVideoRecord)}`);
    }

    if (
      externalVideoRecord.provider !== "yandex_disk" ||
      externalVideoRecord.kind !== "video" ||
      externalVideoRecord.external_url !== externalVideoUrl
    ) {
      throw new Error(`Unexpected external video record: ${JSON.stringify(externalVideoRecord)}`);
    }

    await assertMediaRedirect(photoRecord.id, expectedObjectStorageHost, requestContext);
    await assertMediaRedirect(`/api/media/${photoRecord.id}?variant=thumb`, "/variants/thumb.webp", requestContext);
    await assertMediaRedirect(storageVideoRecord.id, expectedObjectStorageHost, requestContext);
    await assertMediaRedirect(externalVideoRecord.id, externalVideoUrl, requestContext);
    await assertViewerShowsMedia(page);
    await cleanupMedia([photoRecord.id, storageVideoRecord.id, externalVideoRecord.id], requestContext);
    mediaIds = [];

    await cleanupMediaByTitle(treeId, requestContext).catch((error) => {
      console.warn("cleanup warning: post-delete cleanupMediaByTitle", error);
    });

    const afterDelete = await fetchMediaRecords(treeId, {
      requireAllExpected: false,
      expectEmpty: true,
      attempts: 24,
      requestContext,
    });
    if (afterDelete.length !== 0) {
      throw new Error(`Expected media to be deleted, but ${afterDelete.length} records remain.`);
    }

    report.ok = true;
    report.verifiedProviders = ["object_storage", "yandex_disk"];
    report.mediaRecords = mediaRecords.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      provider: item.provider,
      storage_path: item.storage_path,
      external_url: item.external_url
    }));
  } catch (error) {
    failure = error;
    if (report) {
      report.diagnostics.error = error instanceof Error ? error.stack || error.message : String(error);
    }
    if (page) {
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      if (report) {
        report.artifacts.screenshotPath = screenshotPath;
      }
    }
  } finally {
    await cleanupMedia(mediaIds, requestContext);
    if (treeId) {
      await cleanupMediaByTitle(treeId, requestContext).catch((error) => {
        console.warn("cleanup warning: cleanupMediaByTitle", error);
      });
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    await smokeRuntime.stop();

    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  }

  if (failure) {
    throw failure;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
