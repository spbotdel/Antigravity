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
  };

  for (const argument of argv) {
    if (argument.startsWith("--force-proxy=")) {
      const rawValue = argument.slice("--force-proxy=".length).trim().toLowerCase();
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
const mediaStorageBackend = env.MEDIA_STORAGE_BACKEND || "supabase";
const cloudflareRolloutAt = env.CF_R2_ROLLOUT_AT ? Date.parse(env.CF_R2_ROLLOUT_AT) : null;
const shouldUseCloudflareForNewMedia =
  mediaStorageBackend === "cloudflare_r2" &&
  (cloudflareRolloutAt === null ? !env.CF_R2_ROLLOUT_AT : Number.isFinite(cloudflareRolloutAt) && Date.now() >= cloudflareRolloutAt);
const expectedObjectStorageHost =
  shouldUseCloudflareForNewMedia
    ? new URL(env.CF_R2_ENDPOINT || `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`).host
    : "storage.yandexcloud.net";
const slug = "test-tree";
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
const expectedForceProxyUpload = cliOptions.forceProxyUpload;
const expectedUploadMode =
  expectedResolvedUploadBackend === "cloudflare_r2" && !expectedForceProxyUpload
    ? "direct"
    : "proxy";

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

function builderInspector(page) {
  return page.locator("aside.builder-inspector");
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  let parsed = null;
  if (body) {
    try {
      parsed = parsePossiblyNoisyJson(body);
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${url}: ${body.slice(0, 300)}`);
    }
  }
  if (!response.ok) {
    throw new Error(parsed?.error || `POST ${url} failed with ${response.status}`);
  }
  return parsed;
}

async function createExternalVideoViaApi(treeId, personId) {
  await postJson(`${baseUrl}/api/media/complete`, {
    treeId,
    personId,
    mediaId: crypto.randomUUID(),
    provider: "yandex_disk",
    externalUrl: externalVideoUrl,
    visibility: "members",
    title: externalVideoTitle,
    caption: `${externalVideoTitle} caption`
  });
}

async function fetchUploadIntentContracts(treeId, personId) {
  const photoIntent = await postJson(`${baseUrl}/api/media/upload-intent`, {
    treeId,
    personId,
    filename: "rollout-check-photo.jpg",
    mimeType: "image/jpeg",
    visibility: "members",
    title: `Rollout Photo ${timestamp}`,
    caption: ""
  });

  const archiveVideoIntent = await postJson(`${baseUrl}/api/media/archive/upload-intent`, {
    treeId,
    filename: "rollout-check-video.webm",
    mimeType: "video/webm",
    visibility: "members",
    title: `Rollout Video ${timestamp}`,
    caption: ""
  });

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
  await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`**/tree/${slug}/builder`);
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 45000 });
  await builderInspector(page).waitFor({ timeout: 45000 });
  await builderInspector(page).locator("h2").waitFor({ timeout: 45000 });
}

async function openMediaPanel(page, tabLabel = "Фото") {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: tabLabel, exact: true }).click();
  await inspector.locator("form").nth(0).waitFor({ timeout: 30000 });
}

async function uploadDeviceMediaViaUi(page, options) {
  const {
    tabLabel,
    inputLabel,
    title,
    caption,
    submitButtonLabel,
    files,
    hasServerSideVariants = false,
  } = options;
  const inspector = builderInspector(page);
  await openMediaPanel(page, tabLabel);
  const storageForm = inspector.locator("form").nth(0);
  await inspector.locator(".builder-media-limits-note").waitFor({ timeout: 15000 });
  await storageForm.getByLabel(inputLabel).setInputFiles(files);
  const reviewDialog = page.getByRole("dialog", { name: "Проверка файлов перед загрузкой" });
  await reviewDialog.waitFor({ timeout: 15000 });
  await reviewDialog.getByRole("button", { name: "Обратно" }).click();
  await reviewDialog.waitFor({ state: "detached", timeout: 15000 });
  await storageForm.getByLabel("Подпись").fill(caption);
  await storageForm.getByLabel("Видимость").selectOption("members");
  await storageForm.getByRole("button", { name: submitButtonLabel }).click();
  await reviewDialog.waitFor({ timeout: 15000 });
  await reviewDialog.getByRole("button", { name: "Сохранить 1" }).click();
  await reviewDialog.waitFor({ state: "detached", timeout: 30000 });
  await inspector.locator(".builder-media-limits-note").waitFor({ timeout: 15000 });
  await inspector.getByText(/Загружено 1 файл|Загружено 1 файла|Загружено 1 файлов/).waitFor({ timeout: 90000 });
}

async function uploadDevicePhotoViaUi(page) {
  await uploadDeviceMediaViaUi(page, {
    tabLabel: "Фото",
    inputLabel: "Фотографии с устройства",
    title: photoTitle,
    caption: `${photoTitle} caption`,
    submitButtonLabel: "Проверить фото перед загрузкой",
    hasServerSideVariants: true,
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
    title: storageVideoTitle,
    caption: `${storageVideoTitle} caption`,
    submitButtonLabel: "Проверить видео перед загрузкой",
    hasServerSideVariants: false,
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
  } = options;

  const retryAttempts = attempts ?? (expectEmpty ? 16 : 8);

  return withRetries("builder-snapshot:media", async () => {
    const response = await fetch(`${baseUrl}/api/tree/${slug}/builder-snapshot?includeMedia=1`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`builder snapshot with media failed: ${response.status}`);
    }

    const snapshot = parsePossiblyNoisyJson(await response.text());
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

async function assertMediaRedirect(mediaPathOrId, expectedUrlPart) {
  const mediaPath = mediaPathOrId.includes("/") || mediaPathOrId.includes("?") ? mediaPathOrId : `/api/media/${mediaPathOrId}`;
  const url = new URL(mediaPath, baseUrl);
  const transport = url.protocol === "https:" ? https : http;
  const result = await new Promise((resolve, reject) => {
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

async function cleanupMedia(mediaIds) {
  for (const mediaId of mediaIds) {
    try {
      await fetch(`${baseUrl}/api/media/${mediaId}`, {
        method: "DELETE"
      });
    } catch (error) {
      console.warn("cleanup warning", mediaId, error);
    }
  }
}

async function cleanupMediaByTitle(treeId) {
  const records = await fetchMediaRecords(treeId, { requireAllExpected: false });
  await cleanupMedia(records.map((item) => item.id));
}

async function cleanupStaleSmokeMedia(treeId) {
  const staleRecords = await fetchMediaRecords(treeId, {
    requireAllExpected: false,
    titlePrefixes: ["Device Photo ", "Device Video ", "External Video ", "Device Upload "],
  });

  if (!staleRecords.length) {
    return;
  }

  await cleanupMedia(staleRecords.map((item) => item.id));
}

async function main() {
  const smokeRuntime = await startMediaSmokeRuntime();
  baseUrl = smokeRuntime.baseUrl;
  fs.mkdirSync(artifactDir, { recursive: true });

  const snapshotResponse = await fetch(`${baseUrl}/api/tree/${slug}/builder-snapshot`, { cache: "no-store" });
  if (!snapshotResponse.ok) {
    throw new Error(`builder snapshot failed: ${snapshotResponse.status}`);
  }

  const snapshot = parsePossiblyNoisyJson(await snapshotResponse.text());
  const treeId = snapshot.tree.id;
  const personId = snapshot.tree.root_person_id || snapshot.people[0].id;
  const report = {
    ok: false,
    slug,
    treeId,
    smokeMode: expectedForceProxyUpload ? "proxy" : "direct",
    photoTitle,
    storageVideoTitle,
    externalVideoTitle,
    verifiedProviders: [],
    uploadIntentContracts: null,
    diagnostics: {},
    artifacts: {
      reportPath,
      screenshotPath: null
    }
  };
  let browser = null;
  let mediaIds = [];
  let failure = null;

  try {
    await cleanupStaleSmokeMedia(treeId).catch((error) => {
      console.warn("cleanup warning: cleanupStaleSmokeMedia", error);
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 }
    });
    const page = await context.newPage();

    await withRetries("builder:init", async () => {
      await waitForBuilderReady(page);
      await openMediaPanel(page, "Фото");
    });
    const uploadIntentContracts = await fetchUploadIntentContracts(treeId, personId);
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
      requireAllExpected: true
    });
    await uploadDeviceVideoViaUi(page);
    await fetchMediaRecords(treeId, {
      expectedTitles: [uploadedPhotoRecordTitle, uploadedStorageVideoRecordTitle],
      requireAllExpected: true
    });
    await createExternalVideoViaApi(treeId, personId);

    const mediaRecords = await fetchMediaRecords(treeId);
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

    await assertMediaRedirect(photoRecord.id, expectedObjectStorageHost);
    await assertMediaRedirect(`/api/media/${photoRecord.id}?variant=thumb`, "/variants/thumb.webp");
    await assertMediaRedirect(storageVideoRecord.id, expectedObjectStorageHost);
    await assertMediaRedirect(externalVideoRecord.id, externalVideoUrl);
    await assertViewerShowsMedia(page);
    await cleanupMedia([photoRecord.id, storageVideoRecord.id, externalVideoRecord.id]);
    mediaIds = [];

    const afterDelete = await fetchMediaRecords(treeId, { requireAllExpected: false, expectEmpty: true });
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
    report.diagnostics.error = error instanceof Error ? error.stack || error.message : String(error);
    if (browser) {
      const context = browser.contexts()[0] || null;
      const page = context ? context.pages()[0] || null : null;
      if (page) {
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        report.artifacts.screenshotPath = screenshotPath;
      }
    }
  } finally {
    await cleanupMedia(mediaIds);
    await cleanupMediaByTitle(treeId).catch((error) => {
      console.warn("cleanup warning: cleanupMediaByTitle", error);
    });
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
