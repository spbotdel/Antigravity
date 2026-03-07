import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

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
const baseUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const slug = "test-tree";
const fixturePath = path.resolve("tests/fixtures/smoke-photo.png");
const artifactDir = path.resolve("tests/artifacts");
const timestamp = Date.now();
const screenshotPath = path.join(artifactDir, `media-storage-e2e-${timestamp}.png`);
const reportPath = path.join(artifactDir, `media-storage-report-${timestamp}.json`);
const deviceUploadTitle = `Device Upload ${timestamp}`;
const photoTitle = `${deviceUploadTitle} · 1`;
const storageVideoTitle = `${deviceUploadTitle} · 2`;
const externalVideoTitle = `External Video ${timestamp}`;
const externalVideoUrl = `https://example.com/family-video-${timestamp}`;

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

async function withRetries(label, task, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      console.warn(`${label} retry ${attempt}/${attempts - 1}`, error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError;
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

async function waitForBuilderReady(page) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`**/tree/${slug}/builder`);
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 45000 });
  await builderInspector(page).waitFor({ timeout: 45000 });
  await builderInspector(page).locator("h2").waitFor({ timeout: 45000 });
}

async function openMediaPanel(page) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Медиа", exact: true }).click();
  await inspector.locator("form").nth(0).waitFor({ timeout: 30000 });
}

async function uploadDeviceMediaBatchViaUi(page) {
  const inspector = builderInspector(page);
  const storageForm = inspector.locator("form").nth(0);
  await inspector.locator(".builder-media-limits-note").waitFor({ timeout: 15000 });
  await storageForm.getByLabel("Фото, видео и документы").setInputFiles([
    {
      name: "smoke-photo.png",
      mimeType: "image/png",
      buffer: fs.readFileSync(fixturePath)
    },
    {
      name: "smoke-video.webm",
      mimeType: "video/webm",
      buffer: Buffer.from("RIFF....WEBMsmoke-video-device-upload")
    }
  ]);
  await storageForm.getByLabel("Название (необязательно)").fill(deviceUploadTitle);
  await storageForm.getByLabel("Подпись").fill(`${deviceUploadTitle} caption`);
  await storageForm.getByLabel("Видимость").selectOption("members");
  await storageForm.getByRole("button", { name: "Загрузить файлы" }).click();
  await inspector.locator(".builder-upload-item-done").nth(1).waitFor({ timeout: 45000 });
  await inspector.getByRole("heading", { name: photoTitle, exact: true }).waitFor({ timeout: 45000 });
  await inspector.getByRole("heading", { name: storageVideoTitle, exact: true }).waitFor({ timeout: 45000 });
}

async function createExternalVideoViaUi(page) {
  const externalForm = builderInspector(page).locator("form").nth(1);
  await externalForm.getByLabel("Ссылка на видео").fill(externalVideoUrl);
  await externalForm.getByLabel("Название").fill(externalVideoTitle);
  await externalForm.getByLabel("Подпись").fill(`${externalVideoTitle} caption`);
  await externalForm.getByLabel("Видимость").selectOption("members");
  await externalForm.getByRole("button", { name: "Добавить видео по ссылке" }).click();
  await builderInspector(page).getByRole("heading", { name: externalVideoTitle, exact: true }).waitFor({ timeout: 45000 });
}

async function fetchMediaRecords(treeId) {
  return withRetries("builder-snapshot:media", async () => {
    const response = await fetch(`${baseUrl}/api/tree/${slug}/builder-snapshot?includeMedia=1`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`builder snapshot with media failed: ${response.status}`);
    }

    const snapshot = parsePossiblyNoisyJson(await response.text());
    if (!snapshot?.tree?.id || snapshot.tree.id !== treeId) {
      throw new Error("Builder snapshot returned unexpected tree.");
    }

    return (snapshot.media || []).filter((item) => [photoTitle, storageVideoTitle, externalVideoTitle].includes(item.title));
  });
}

async function assertMediaRedirect(mediaId, expectedUrlPart) {
  const url = new URL(`${baseUrl}/api/media/${mediaId}`);
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
    throw new Error(`Expected 307 for media ${mediaId}, got ${result.status}`);
  }

  if (!result.location || !result.location.includes(expectedUrlPart)) {
    throw new Error(`Unexpected redirect for media ${mediaId}: ${result.location || "<missing>"}`);
  }
}

async function assertViewerShowsMedia(page) {
  await withRetries("viewer", async () => {
    await page.goto(`${baseUrl}/tree/${slug}`, { waitUntil: "domcontentloaded" });
    const gallery = page.locator(".person-media-gallery");
    await gallery.waitFor({ timeout: 45000 });
    await gallery.locator(".person-media-thumb").filter({ hasText: photoTitle }).first().waitFor({ timeout: 15000 });
    await gallery.locator(".person-media-thumb").filter({ hasText: storageVideoTitle }).first().waitFor({ timeout: 15000 });
    await gallery.locator(".person-media-thumb").filter({ hasText: externalVideoTitle }).first().waitFor({ timeout: 15000 });
    await page.getByRole("heading", { name: externalVideoTitle, exact: true }).waitFor({ timeout: 15000 });
    await gallery.getByRole("link", { name: "Открыть внешнее видео" }).first().waitFor({ timeout: 15000 });
  });
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
  const records = await fetchMediaRecords(treeId);
  await cleanupMedia(records.map((item) => item.id));
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });

  const snapshotResponse = await fetch(`${baseUrl}/api/tree/${slug}/builder-snapshot`, { cache: "no-store" });
  if (!snapshotResponse.ok) {
    throw new Error(`builder snapshot failed: ${snapshotResponse.status}`);
  }

  const snapshot = parsePossiblyNoisyJson(await snapshotResponse.text());
  const treeId = snapshot.tree.id;
  const report = {
    ok: false,
    slug,
    treeId,
    photoTitle,
    storageVideoTitle,
    externalVideoTitle,
    verifiedProviders: [],
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
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 }
    });
    const page = await context.newPage();

    await withRetries("builder:init", async () => {
      await waitForBuilderReady(page);
      await openMediaPanel(page);
    });
    await uploadDeviceMediaBatchViaUi(page);
    await createExternalVideoViaUi(page);

    const mediaRecords = await fetchMediaRecords(treeId);
    const photoRecord = mediaRecords.find((item) => item.title === photoTitle);
    const storageVideoRecord = mediaRecords.find((item) => item.title === storageVideoTitle);
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

    await assertMediaRedirect(photoRecord.id, "storage.yandexcloud.net");
    await assertMediaRedirect(storageVideoRecord.id, "storage.yandexcloud.net");
    await assertMediaRedirect(externalVideoRecord.id, externalVideoUrl);
    await assertViewerShowsMedia(page);
    await cleanupMedia([photoRecord.id, storageVideoRecord.id, externalVideoRecord.id]);
    mediaIds = [];

    const afterDelete = await fetchMediaRecords(treeId);
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
