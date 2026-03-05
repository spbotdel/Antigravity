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
const prefix = `Stress-${timestamp}`;
const artifactDir = path.resolve("tests/artifacts");
const artifactPath = path.join(artifactDir, `builder-stress-${timestamp}.png`);

function sidebarItem(page, name) {
  return page.locator(".person-list-item").filter({ has: page.locator("strong", { hasText: name }) }).first();
}

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

async function cleanupStressArtifacts() {
  const snapshot = await withRetries("cleanup:fetchSnapshot", () => fetchSnapshot());
  const stressPeople = snapshot.people.filter((person) => person.full_name.includes(prefix));

  for (const person of stressPeople) {
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

async function waitForBuilderReady(page) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`);
  await page.waitForURL(`**/tree/${slug}/builder`);
  await page.locator(".builder-layout-reworked").waitFor({ timeout: 30000 });
  await page.locator("aside.builder-inspector").waitFor({ timeout: 30000 });
}

async function selectPerson(page, name) {
  const item = sidebarItem(page, name);
  await item.waitFor({ timeout: 45000 });
  await item.click();
  await page.locator("aside.builder-inspector h2", { hasText: name }).waitFor({ timeout: 45000 });
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

async function waitForPersonCount(page, expectedCount) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".person-list-item").length === count,
    expectedCount,
    { timeout: 45000 }
  );
}

async function openCreateMenu(page) {
  const canvas = page.locator(".tree-canvas");
  const button = canvas.locator('[aria-label="Открыть меню добавления связи"]').first();
  await button.waitFor({ state: "attached", timeout: 15000 });
  await button.click({ force: true });
}

async function addRelatedAndRename(page, anchorName, actionLabel, newName) {
  await selectPerson(page, anchorName);
  const beforeCount = await page.locator(".person-list-item").count();
  await openCreateMenu(page);
  await page.locator(".tree-node-action-menu").getByRole("button", { name: actionLabel, exact: true }).click({ force: true });
  await waitForPersonCount(page, beforeCount + 1);
  await waitForSelectedEditable(page);

  const inspector = page.locator("aside.builder-inspector");
  await inspector.locator('input[name="fullName"]').fill(newName);
  await inspector.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Данные человека обновлены.").waitFor({ timeout: 45000 });
  await sidebarItem(page, newName).waitFor({ timeout: 45000 });
  await waitForBuilderReady(page);
}

async function deleteSelectedViaCanvas(page, name) {
  await selectPerson(page, name);
  const beforeCount = await page.locator(".person-list-item").count();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".tree-canvas").getByRole("button", { name: "Удалить выбранного человека" }).click();
  await waitForPersonCount(page, beforeCount - 1);
}

async function deleteSelectedViaInspector(page, name) {
  await selectPerson(page, name);
  const beforeCount = await page.locator(".person-list-item").count();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("aside.builder-inspector").getByRole("button", { name: "Удалить человека", exact: true }).click();
  await waitForPersonCount(page, beforeCount - 1);
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });

  let browser;
  let page;
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  try {
    await cleanupStressArtifacts();

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
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

    await waitForBuilderReady(page);
    const initialSnapshot = await fetchSnapshot();
    const initialPeopleCount = initialSnapshot.people.length;

    const branchRoot = `${prefix}-Root`;
    await addRelatedAndRename(page, "сергей первый", "Добавить ребенка", branchRoot);

    let currentAncestor = branchRoot;
    const ancestorPartnerNames = [];
    for (let index = 1; index <= 10; index += 1) {
      const ancestorName = `${prefix}-A-${String(index).padStart(2, "0")}`;
      const partnerName = `${prefix}-AP-${String(index).padStart(2, "0")}`;
      await addRelatedAndRename(page, currentAncestor, "Добавить родителя", ancestorName);
      await addRelatedAndRename(page, ancestorName, "Добавить партнера", partnerName);
      ancestorPartnerNames.push(partnerName);
      currentAncestor = ancestorName;
    }

    let currentDescendantAnchor = branchRoot;
    const descendantPartnerNames = [];
    for (let index = 1; index <= 10; index += 1) {
      const descendantName = `${prefix}-D-${String(index).padStart(2, "0")}`;
      const partnerName = `${prefix}-DP-${String(index).padStart(2, "0")}`;
      await addRelatedAndRename(page, currentDescendantAnchor, "Добавить ребенка", descendantName);
      await addRelatedAndRename(page, descendantName, "Добавить партнера", partnerName);
      descendantPartnerNames.push(partnerName);
      currentDescendantAnchor = descendantName;
    }

    await deleteSelectedViaCanvas(page, descendantPartnerNames[descendantPartnerNames.length - 1]);
    await deleteSelectedViaInspector(page, ancestorPartnerNames[ancestorPartnerNames.length - 1]);

    const finalSnapshot = await fetchSnapshot();
    const stressPeople = finalSnapshot.people.filter((person) => person.full_name.includes(prefix));

    await page.screenshot({ path: artifactPath, fullPage: true });

    const expectedNetPeople = 1 + 10 + 10 + 10 + 10 - 2;
    const actualNetPeople = finalSnapshot.people.length - initialPeopleCount;
    if (actualNetPeople !== expectedNetPeople) {
      throw new Error(`Unexpected net people count: expected ${expectedNetPeople}, got ${actualNetPeople}`);
    }

    if (stressPeople.length !== expectedNetPeople) {
      throw new Error(`Stress branch count mismatch: expected ${expectedNetPeople}, got ${stressPeople.length}`);
    }

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

    console.log(
      JSON.stringify(
        {
          ok: true,
          artifactPath,
          initialPeopleCount,
          finalPeopleCount: finalSnapshot.people.length,
          stressPeopleCount: stressPeople.length,
          deleted: [descendantPartnerNames[descendantPartnerNames.length - 1], ancestorPartnerNames[ancestorPartnerNames.length - 1]]
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
      await browser.close().catch(() => {});
    }
    await cleanupStressArtifacts().catch((error) => {
      console.warn("cleanup warning", error);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
