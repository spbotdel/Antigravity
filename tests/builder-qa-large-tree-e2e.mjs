import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

function readEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        if (idx === -1) {
          return [line, ""];
        }
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

async function withRetries(label, task, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      console.warn(`[retry] ${label} ${attempt}/${attempts - 1}: ${error?.message || error}`);
    }
  }
  throw lastError;
}

async function parseResponse(response, label) {
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const details = body?.message ? ` ${body.message}` : "";
    throw new Error(`${label} failed: ${response.status}${details}`);
  }

  return body;
}

async function apiJson(baseUrl, method, endpoint, payload, label) {
  return withRetries(label, async () => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        "content-type": "application/json"
      },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    return parseResponse(response, label);
  });
}

async function apiDelete(baseUrl, endpoint, label) {
  return withRetries(label, async () => {
    const response = await fetch(`${baseUrl}${endpoint}`, { method: "DELETE" });
    return parseResponse(response, label);
  });
}

async function waitForCondition(label, checkFn, timeoutMs = 60000, intervalMs = 800) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkFn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout waiting for condition: ${label}`);
}

function sidebarItem(page, name) {
  return page
    .locator(".person-list-item")
    .filter({ has: page.locator("strong", { hasText: name }) })
    .first();
}

async function selectPerson(page, name) {
  const item = sidebarItem(page, name);
  await item.waitFor({ timeout: 60000 });
  await item.click();
  await page.locator("aside.builder-inspector h2", { hasText: name }).waitFor({ timeout: 60000 });
}

async function getSnapshot(baseUrl, slug) {
  return apiJson(baseUrl, "GET", `/api/tree/${slug}/builder-snapshot?includeMedia=0`, undefined, "get snapshot");
}

async function main() {
  const env = readEnv(path.resolve(".env.local"));
  const baseUrl = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const slug = process.argv[2] || "test-tree";
  const timestamp = Date.now();
  const prefix = `QA-${timestamp}`;
  const artifactDir = path.resolve("tests/artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });

  const reportPath = path.join(artifactDir, `builder-qa-report-${timestamp}.json`);
  const viewports = [
    { name: "desktop-1920", width: 1920, height: 1080 },
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "desktop-1280", width: 1280, height: 800 },
    { name: "mobile-390", width: 390, height: 844 }
  ];

  const initialSnapshot = await getSnapshot(baseUrl, slug);
  if (!initialSnapshot?.tree?.id || !initialSnapshot?.people?.length) {
    throw new Error(`Tree "${slug}" is not available for QA`);
  }

  const treeId = initialSnapshot.tree.id;
  const rootPersonId = initialSnapshot.tree.root_person_id || initialSnapshot.people[0].id;
  const rootPerson = initialSnapshot.people.find((person) => person.id === rootPersonId) || initialSnapshot.people[0];

  const created = {
    parent: null,
    partner: null,
    child: null,
    anchorLink: null,
    parentChildLink: null,
    partnership: null
  };

  const report = {
    ok: true,
    slug,
    treeId,
    startPeopleCount: initialSnapshot.people.length,
    endPeopleCount: null,
    viewportChecks: [],
    deletions: {},
    diagnostics: {
      pageErrors: [],
      consoleErrors: [],
      badResponses: []
    },
    artifacts: {
      reportPath
    }
  };

  let browser = null;

  try {
    created.parent = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/persons",
        {
          treeId,
          fullName: `${prefix} Parent`,
          gender: "male",
          birthDate: "1988-06-15",
          birthPlace: "Moscow",
          isLiving: true
        },
        "create temp parent"
      )
    ).person;

    created.partner = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/persons",
        {
          treeId,
          fullName: `${prefix} Partner`,
          gender: "female",
          birthDate: "1990-09-03",
          birthPlace: "Kazan",
          isLiving: true
        },
        "create temp partner"
      )
    ).person;

    created.child = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/persons",
        {
          treeId,
          fullName: `${prefix} Child`,
          gender: "female",
          birthDate: "2016-04-11",
          birthPlace: "Kazan",
          isLiving: true
        },
        "create temp child"
      )
    ).person;

    created.anchorLink = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/relationships/parent-child",
        {
          treeId,
          parentPersonId: rootPerson.id,
          childPersonId: created.parent.id,
          relationType: "adoptive"
        },
        "create root->parent link"
      )
    ).link;

    created.parentChildLink = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/relationships/parent-child",
        {
          treeId,
          parentPersonId: created.parent.id,
          childPersonId: created.child.id,
          relationType: "biological"
        },
        "create parent->child link"
      )
    ).link;

    created.partnership = (
      await apiJson(
        baseUrl,
        "POST",
        "/api/partnerships",
        {
          treeId,
          personAId: created.parent.id,
          personBId: created.partner.id,
          status: "married",
          startDate: "2015-01-10"
        },
        "create parent partnership"
      )
    ).partnership;

    browser = await chromium.launch({ headless: true });
    const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const qaPage = await desktopContext.newPage();

    qaPage.on("pageerror", (error) => {
      report.diagnostics.pageErrors.push(error.message);
    });
    qaPage.on("console", (msg) => {
      if (msg.type() === "error") {
        report.diagnostics.consoleErrors.push(msg.text());
      }
    });
    qaPage.on("response", (response) => {
      const url = response.url();
      if (response.status() >= 400 && url.startsWith(baseUrl)) {
        report.diagnostics.badResponses.push(`${response.status()} ${url}`);
      }
    });

    await qaPage.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded" });
    await qaPage.waitForURL(`**/tree/${slug}/builder`);
    await qaPage.locator(".builder-layout-reworked").waitFor({ timeout: 90000 });
    await qaPage.locator(".person-list-item").first().waitFor({ timeout: 90000 });

    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      page.on("pageerror", (error) => {
        report.diagnostics.pageErrors.push(`[${viewport.name}] ${error.message}`);
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          report.diagnostics.consoleErrors.push(`[${viewport.name}] ${msg.text()}`);
        }
      });
      page.on("response", (response) => {
        const url = response.url();
        if (response.status() >= 400 && url.startsWith(baseUrl)) {
          report.diagnostics.badResponses.push(`[${viewport.name}] ${response.status()} ${url}`);
        }
      });

      await page.goto(`${baseUrl}/tree/${slug}/builder`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(`**/tree/${slug}/builder`);
      await page.locator(".builder-layout-reworked").waitFor({ timeout: 90000 });
      await page.locator(".person-list-item").first().waitFor({ timeout: 90000 });

      const screenshotPath = path.join(artifactDir, `builder-qa-${viewport.name}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      report.viewportChecks.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        screenshotPath
      });

      await context.close();
    }

    await selectPerson(qaPage, `${prefix} Parent`);
    await qaPage.locator("aside.builder-inspector").getByRole("button", { name: "Связи", exact: true }).click();

    const childCard = qaPage.locator(".builder-relation-card").filter({
      has: qaPage.locator("strong", { hasText: `${prefix} Child` })
    });
    await childCard.first().waitFor({ timeout: 60000 });
    await childCard.first().getByRole("button", { name: "Удалить", exact: true }).click();

    await waitForCondition("parent-child link deleted", async () => {
      const snapshot = await getSnapshot(baseUrl, slug);
      return !snapshot.parentLinks.some((link) => link.id === created.parentChildLink.id);
    });
    report.deletions.parentChildLink = { ok: true, id: created.parentChildLink.id };

    const partnerCard = qaPage.locator(".builder-relation-card").filter({
      has: qaPage.locator("strong", { hasText: `${prefix} Partner` })
    });
    await partnerCard.first().waitFor({ timeout: 60000 });
    await partnerCard.first().getByRole("button", { name: "Удалить", exact: true }).click();

    await waitForCondition("partnership deleted", async () => {
      const snapshot = await getSnapshot(baseUrl, slug);
      return !snapshot.partnerships.some((partnership) => partnership.id === created.partnership.id);
    });
    report.deletions.partnership = { ok: true, id: created.partnership.id };

    await qaPage.locator("aside.builder-inspector").getByRole("button", { name: "Человек", exact: true }).click();
    await selectPerson(qaPage, `${prefix} Partner`);
    qaPage.once("dialog", (dialog) => dialog.accept());
    await qaPage.locator("aside.builder-inspector").getByRole("button", { name: "Удалить человека", exact: true }).click();

    await waitForCondition("person deleted", async () => {
      const snapshot = await getSnapshot(baseUrl, slug);
      return !snapshot.people.some((person) => person.id === created.partner.id);
    });
    report.deletions.person = { ok: true, id: created.partner.id };

    created.partner = null;
    const publicPage = await desktopContext.newPage();
    const publicResponse = await publicPage.goto(`${baseUrl}/tree/${slug}`, { waitUntil: "domcontentloaded" });
    if (!publicResponse || publicResponse.status() >= 400) {
      throw new Error(`Public route failed after QA scenario: ${publicResponse?.status() || "no response"}`);
    }
    const publicShotPath = path.join(artifactDir, `builder-qa-public-${timestamp}.png`);
    await publicPage.screenshot({ path: publicShotPath, fullPage: true });
    report.artifacts.publicPath = publicShotPath;

    const scenarioSnapshot = await getSnapshot(baseUrl, slug);
    report.scenarioPeopleCount = scenarioSnapshot.people.length;
    report.scenarioParentLinksCount = scenarioSnapshot.parentLinks.length;
    report.scenarioPartnershipsCount = scenarioSnapshot.partnerships.length;

    const hydrationErrors = report.diagnostics.consoleErrors.filter((message) => message.toLowerCase().includes("hydrat"));
    if (hydrationErrors.length) {
      throw new Error(`Hydration errors detected: ${hydrationErrors.length}`);
    }
  } finally {
    const cleanupIds = [created.child?.id, created.parent?.id, created.partner?.id].filter(Boolean);
    for (const personId of cleanupIds) {
      try {
        await apiDelete(baseUrl, `/api/persons/${personId}`, `cleanup person ${personId}`);
      } catch (error) {
        report.diagnostics.cleanupError = `${report.diagnostics.cleanupError || ""} ${String(error)}`.trim();
      }
    }

    try {
      const cleanupSnapshot = await getSnapshot(baseUrl, slug);
      report.endPeopleCount = cleanupSnapshot.people.length;
      report.endParentLinksCount = cleanupSnapshot.parentLinks.length;
      report.endPartnershipsCount = cleanupSnapshot.partnerships.length;
    } catch (error) {
      report.diagnostics.cleanupSnapshotError = String(error);
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  if (report.diagnostics.pageErrors.length || report.diagnostics.badResponses.length) {
    throw new Error(
      JSON.stringify(
        {
          pageErrors: report.diagnostics.pageErrors,
          badResponses: report.diagnostics.badResponses
        },
        null,
        2
      )
    );
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
