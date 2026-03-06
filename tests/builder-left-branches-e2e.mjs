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
const timestamp = Date.now();
const scenarioId = String(timestamp).slice(-6);
const prefix = `LB${scenarioId}`;
const artifactDir = path.resolve("tests/artifacts");
const artifactPath = path.join(artifactDir, `builder-left-branches-${timestamp}.png`);

async function withRetries(label, task, attempts = 4) {
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

async function fetchSnapshot() {
  const response = await fetch(`${baseUrl}/api/tree/${slug}/builder-snapshot`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`builder snapshot failed: ${response.status}`);
  }

  return response.json();
}

async function cleanupArtifactsByPrefix() {
  const snapshot = await withRetries("cleanup:fetchSnapshot", () => fetchSnapshot());
  const leftBranchPeople = snapshot.people.filter(
    (person) => person.full_name.includes(prefix) || person.full_name.startsWith("LB") || person.full_name.startsWith("LeftBranch-")
  );

  for (const person of leftBranchPeople) {
    await withRetries(`cleanup:delete:${person.id}`, async () => {
      const response = await fetch(`${baseUrl}/api/persons/${person.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error(`delete failed ${person.id}: ${response.status}`);
      }
    }).catch((error) => {
      console.warn("cleanup warning", error);
    });
  }
}

async function waitForSnapshotCount(expectedCount) {
  await withRetries("waitForSnapshotCount", async () => {
    const snapshot = await fetchSnapshot();
    if (snapshot.people.length !== expectedCount) {
      throw new Error(`expected ${expectedCount}, got ${snapshot.people.length}`);
    }
    return snapshot;
  });
}

async function waitForBuilderReady(page, expectedSelectedName) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`);
  await page.waitForURL(`**/tree/${slug}/builder`);
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 30000 });
  await page.locator(".tree-canvas").waitFor({ timeout: 30000 });
  await page.locator("aside.builder-inspector").waitFor({ timeout: 30000 });
  if (expectedSelectedName) {
    await page.locator("aside.builder-inspector h2", { hasText: expectedSelectedName }).waitFor({ timeout: 30000 });
  }
}

async function waitForSelectedEditable(page) {
  const inspector = page.locator("aside.builder-inspector");
  await inspector.getByRole("button", { name: "Человек", exact: true }).click();
  await page.waitForFunction(() => {
    const inspectorRoot = document.querySelector("aside.builder-inspector");
    if (!inspectorRoot) {
      return false;
    }

    const pendingText = inspectorRoot.textContent || "";
    if (pendingText.includes("Блок создается")) {
      return false;
    }

    const fullNameInput = inspectorRoot.querySelector('input[name="fullName"]');
    const saveButton = [...inspectorRoot.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Сохранить");
    return Boolean(fullNameInput && saveButton);
  }, { timeout: 45000 });
}

async function openCreateMenu(page) {
  const canvas = page.locator(".tree-canvas");
  const button = canvas.locator('[aria-label="Открыть меню добавления связи"]').first();
  await button.waitFor({ state: "attached", timeout: 15000 });
  await button.click({ force: true });
  await page.locator(".tree-node-action-menu").waitFor({ timeout: 15000 });
}

async function addRelatedAndRenameFromCurrent(page, actionLabel, newName, expectedCount) {
  await openCreateMenu(page);
  await page.locator(".tree-node-action-menu").getByRole("button", { name: actionLabel, exact: true }).click({ force: true });
  await waitForSnapshotCount(expectedCount);
  await waitForSelectedEditable(page);

  const inspector = page.locator("aside.builder-inspector");
  await inspector.locator('input[name="fullName"]').fill(newName);
  await inspector.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Данные человека обновлены.").waitFor({ timeout: 45000 });
  await page.locator("aside.builder-inspector h2", { hasText: newName }).waitFor({ timeout: 45000 });
}

async function openRelationPerson(page, groupTitle, personName) {
  const inspector = page.locator("aside.builder-inspector");
  await inspector.getByRole("button", { name: "Связи", exact: true }).click();
  const card = inspector.locator(".builder-relation-card").filter({ hasText: personName }).first();
  await card.waitFor({ timeout: 30000 });
  await card.getByRole("button", { name: "Открыть", exact: true }).click();
  await page.locator("aside.builder-inspector h2", { hasText: personName }).waitFor({ timeout: 30000 });
}

async function navigatePathFromRoot(page, rootName, pathSteps) {
  await waitForBuilderReady(page, rootName);
  for (const step of pathSteps) {
    await openRelationPerson(page, step.groupTitle, step.name);
  }
}

async function deleteCurrentPerson(page, expectedCount) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("aside.builder-inspector").getByRole("button", { name: "Удалить человека", exact: true }).click();
  await waitForSnapshotCount(expectedCount);
}

function assertNoDiagnostics({ pageErrors, consoleErrors, badResponses }) {
  if (pageErrors.length || consoleErrors.length || badResponses.length) {
    throw new Error(
      JSON.stringify(
        {
          pageErrors,
          consoleErrors,
          badResponses
        },
        null,
        2
      )
    );
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });

  let browser;
  let page;
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  try {
    await cleanupArtifactsByPrefix();

    const initialSnapshot = await withRetries("scenario:initialSnapshot", () => fetchSnapshot());
    const rootId = initialSnapshot.tree.root_person_id || initialSnapshot.people[0]?.id;
    const rootPerson = initialSnapshot.people.find((person) => person.id === rootId) || initialSnapshot.people[0];
    if (!rootPerson?.full_name) {
      throw new Error("Не удалось определить стартового человека для сценария.");
    }

    const rootName = rootPerson.full_name;
    const initialCount = initialSnapshot.people.length;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1400 }
    });
    page = await context.newPage();

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (response.status() >= 400 && url.startsWith(baseUrl)) {
        badResponses.push(`${response.status()} ${url}`);
      }
    });

    await waitForBuilderReady(page, rootName);
    console.log("[builder-left] ready");

    const names = {
      p1: `${prefix}-P1`,
      p2: `${prefix}-P2`,
      p3: `${prefix}-P3`,
      ps1: `${prefix}-PS1`,
      ps2: `${prefix}-PS2`,
      ps3: `${prefix}-PS3`,
      spa1: `${prefix}-SPA1`,
      spa2: `${prefix}-SPA2`,
      spa3: `${prefix}-SPA3`,
      spb1: `${prefix}-SPB1`,
      spb2: `${prefix}-SPB2`,
      spb3: `${prefix}-SPB3`
    };

    let expectedCount = initialCount;

    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.p1, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.p2, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.p3, expectedCount);

    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.ps3, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.spa3, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.spb3, expectedCount);

    await navigatePathFromRoot(page, rootName, [
      { groupTitle: "Родители", name: names.p1 },
      { groupTitle: "Родители", name: names.p2 }
    ]);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.ps2, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.spa2, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.spb2, expectedCount);

    await navigatePathFromRoot(page, rootName, [
      { groupTitle: "Родители", name: names.p1 }
    ]);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.ps1, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить родителя", names.spa1, expectedCount);
    expectedCount += 1;
    await addRelatedAndRenameFromCurrent(page, "Добавить партнера", names.spb1, expectedCount);
    console.log("[builder-left] creation complete");

    const deletionPlan = [
      { name: names.spb3, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Родители", name: names.p3 }, { groupTitle: "Пары", name: names.ps3 }, { groupTitle: "Родители", name: names.spa3 }, { groupTitle: "Пары", name: names.spb3 }] },
      { name: names.spa3, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Родители", name: names.p3 }, { groupTitle: "Пары", name: names.ps3 }, { groupTitle: "Родители", name: names.spa3 }] },
      { name: names.ps3, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Родители", name: names.p3 }, { groupTitle: "Пары", name: names.ps3 }] },
      { name: names.spb2, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Пары", name: names.ps2 }, { groupTitle: "Родители", name: names.spa2 }, { groupTitle: "Пары", name: names.spb2 }] },
      { name: names.spa2, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Пары", name: names.ps2 }, { groupTitle: "Родители", name: names.spa2 }] },
      { name: names.ps2, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Пары", name: names.ps2 }] },
      { name: names.spb1, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Пары", name: names.ps1 }, { groupTitle: "Родители", name: names.spa1 }, { groupTitle: "Пары", name: names.spb1 }] },
      { name: names.spa1, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Пары", name: names.ps1 }, { groupTitle: "Родители", name: names.spa1 }] },
      { name: names.ps1, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Пары", name: names.ps1 }] },
      { name: names.p3, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }, { groupTitle: "Родители", name: names.p3 }] },
      { name: names.p2, path: [{ groupTitle: "Родители", name: names.p1 }, { groupTitle: "Родители", name: names.p2 }] },
      { name: names.p1, path: [{ groupTitle: "Родители", name: names.p1 }] }
    ];

    for (const step of deletionPlan) {
      await navigatePathFromRoot(page, rootName, step.path);
      expectedCount -= 1;
      await deleteCurrentPerson(page, expectedCount);
    }
    console.log("[builder-left] deletion complete");

    const finalSnapshot = await withRetries("scenario:finalSnapshot", () => fetchSnapshot());
    const finalBranchPeople = finalSnapshot.people.filter((person) => person.full_name.includes(prefix));

    await page.screenshot({ path: artifactPath, fullPage: true });

    if (finalBranchPeople.length !== 0) {
      throw new Error(`После удаления остались тестовые люди: ${finalBranchPeople.length}`);
    }

    if (finalSnapshot.people.length !== initialCount) {
      throw new Error(`Количество людей не вернулось к исходному значению: было ${initialCount}, стало ${finalSnapshot.people.length}`);
    }

    assertNoDiagnostics({ pageErrors, consoleErrors, badResponses });
    console.log("[builder-left] diagnostics clean");

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactPath,
          rootName,
          createdPeopleCount: 12,
          initialPeopleCount: initialCount,
          finalPeopleCount: finalSnapshot.people.length
        },
        null,
        2
      )
    );
  } catch (error) {
    if (page) {
      await page.screenshot({ path: artifactPath, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    if (browser) {
      void browser.close().catch(() => {});
    }
    void cleanupArtifactsByPrefix().catch((error) => {
      console.warn("cleanup warning", error);
    });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
