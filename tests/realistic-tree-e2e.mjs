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

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function formatDate(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function withRetries(label, task, attempts = 6) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      const delayMs = attempt * 1200;
      console.warn(`[retry] ${label} ${attempt}/${attempts - 1}: ${error?.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function parseJsonResponse(response, label) {
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
    const bodyMessage = body?.message ? ` ${body.message}` : "";
    throw new Error(`${label} failed with ${response.status}.${bodyMessage}`);
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
    return parseJsonResponse(response, label);
  });
}

async function apiDelete(baseUrl, endpoint, label) {
  return withRetries(label, async () => {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "DELETE"
    });
    return parseJsonResponse(response, label);
  });
}

const MALE_FIRST_NAMES = [
  "Ethan",
  "Liam",
  "Noah",
  "Mason",
  "Oliver",
  "Henry",
  "Lucas",
  "Logan",
  "Aiden",
  "Caleb",
  "Wyatt",
  "Owen",
  "Parker",
  "Gavin",
  "Cole",
  "Roman",
  "Levi",
  "Aaron",
  "Miles",
  "Nolan",
  "Hugo",
  "Riley",
  "Julian",
  "Isaac",
  "Connor",
  "Jasper"
];

const FEMALE_FIRST_NAMES = [
  "Emma",
  "Olivia",
  "Ava",
  "Sophia",
  "Mia",
  "Amelia",
  "Harper",
  "Evelyn",
  "Ella",
  "Grace",
  "Nora",
  "Chloe",
  "Lily",
  "Aria",
  "Lucy",
  "Ruby",
  "Violet",
  "Stella",
  "Ivy",
  "Naomi",
  "Claire",
  "Hazel",
  "Sadie",
  "Elena",
  "Maya",
  "Sienna"
];

const LAST_NAMES = [
  "Bennett",
  "Hawkins",
  "Fletcher",
  "Carter",
  "Morgan",
  "Sullivan",
  "Reeves",
  "Henderson",
  "Walsh",
  "Bradley",
  "Turner",
  "Donovan",
  "Fisher",
  "Griffin",
  "Porter",
  "Bishop",
  "Keller",
  "Perry",
  "Manning",
  "Brock",
  "Snyder",
  "Parker",
  "Barrett",
  "Crawford",
  "Miller",
  "Coleman"
];

const CITIES = [
  "Moscow",
  "Saint Petersburg",
  "Kazan",
  "Nizhny Novgorod",
  "Samara",
  "Yekaterinburg",
  "Rostov-on-Don",
  "Novosibirsk",
  "Perm",
  "Voronezh",
  "Krasnodar",
  "Omsk"
];

async function main() {
  const timestamp = Date.now();
  const rng = mulberry32(timestamp);
  const currentYear = new Date().getUTCFullYear();

  const env = readEnv(path.resolve(".env.local"));
  const baseUrl = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const targetSlug = process.argv[2] || "test-tree";
  const artifactDir = path.resolve("tests/artifacts");
  const reportPath = path.join(artifactDir, `realistic-tree-report-${timestamp}.json`);
  const builderShotPath = path.join(artifactDir, `realistic-tree-builder-${timestamp}.png`);
  const publicShotPath = path.join(artifactDir, `realistic-tree-public-${timestamp}.png`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const initialSnapshot = await apiJson(
    baseUrl,
    "GET",
    `/api/tree/${targetSlug}/builder-snapshot?includeMedia=0`,
    undefined,
    "initial snapshot"
  );
  const treeId = initialSnapshot?.tree?.id;
  const anchorRootId = initialSnapshot?.tree?.root_person_id || initialSnapshot?.people?.[0]?.id;
  if (!treeId || !anchorRootId) {
    throw new Error("Failed to resolve treeId or root person for target tree");
  }

  const usedNames = new Set((initialSnapshot.people || []).map((person) => person.full_name).filter(Boolean));
  const createdPeople = [];
  const createdPersonIds = new Set();
  const deleteChecks = [];

  function randInt(min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pick(list) {
    return list[randInt(0, list.length - 1)];
  }

  function randomDateInYear(year) {
    return formatDate(year, randInt(1, 12), randInt(1, 28));
  }

  function pickUniqueName(gender) {
    const firstPool = gender === "female" ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
    for (let attempt = 0; attempt < 3000; attempt += 1) {
      const base = `${pick(firstPool)} ${pick(LAST_NAMES)}`;
      const candidate = usedNames.has(base) ? `${base} ${randInt(10, 99)}` : base;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
    }
    throw new Error("Name generator exhausted");
  }

  function makePersonPayload({ gender, birthYear, branchTag }) {
    const fullName = pickUniqueName(gender);
    const isLiving = birthYear >= 1950 ? rng() < 0.95 : rng() < 0.36;
    const payload = {
      treeId,
      fullName,
      gender,
      birthDate: randomDateInYear(birthYear),
      birthPlace: pick(CITIES),
      bio: `Generated for stress/model run (${branchTag}).`,
      isLiving
    };

    if (!isLiving) {
      const minDeathYear = Math.min(currentYear - 1, birthYear + 45);
      const maxDeathYear = Math.max(minDeathYear, Math.min(currentYear - 1, birthYear + 90));
      payload.deathDate = randomDateInYear(randInt(minDeathYear, maxDeathYear));
      payload.deathPlace = pick(CITIES);
    }

    return payload;
  }

  async function createPersonNode(spec) {
    const payload = makePersonPayload(spec);
    const body = await apiJson(baseUrl, "POST", "/api/persons", payload, `create person ${payload.fullName}`);
    const node = {
      id: body.person.id,
      fullName: body.person.full_name,
      gender: payload.gender,
      birthYear: Number(payload.birthDate.slice(0, 4)),
      branchTag: spec.branchTag
    };
    createdPeople.push(node);
    createdPersonIds.add(node.id);
    return node;
  }

  async function createParentLink(parentNode, childNode, relationType = "biological") {
    const body = await apiJson(
      baseUrl,
      "POST",
      "/api/relationships/parent-child",
      {
        treeId,
        parentPersonId: parentNode.id,
        childPersonId: childNode.id,
        relationType
      },
      `link ${parentNode.fullName} -> ${childNode.fullName}`
    );
    return body.link;
  }

  async function createCouple(nodeA, nodeB, status = "married") {
    const startYear = Math.max(nodeA.birthYear + 18, nodeB.birthYear + 18) + randInt(0, 12);
    const payload = {
      treeId,
      personAId: nodeA.id,
      personBId: nodeB.id,
      status,
      startDate: randomDateInYear(Math.min(startYear, currentYear - 1))
    };

    if (status === "divorced") {
      const endYear = Math.min(currentYear - 1, startYear + randInt(4, 18));
      payload.endDate = randomDateInYear(Math.max(endYear, startYear + 1));
    }

    const body = await apiJson(
      baseUrl,
      "POST",
      "/api/partnerships",
      payload,
      `partnership ${nodeA.fullName} + ${nodeB.fullName}`
    );
    return body.partnership;
  }

  const founderChildCounts = [3, 3, 3, 2, 2];
  const gen2CoupleChildCounts = [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];

  const founders = [];
  const gen2Blood = [];
  const gen2Couples = [];
  const gen3Children = [];

  for (let i = 0; i < founderChildCounts.length; i += 1) {
    const father = await createPersonNode({
      gender: "male",
      birthYear: randInt(1932, 1942),
      branchTag: `founder-${i + 1}`
    });
    const mother = await createPersonNode({
      gender: "female",
      birthYear: randInt(1934, 1945),
      branchTag: `founder-${i + 1}`
    });
    await createCouple(father, mother, "married");
    founders.push({ father, mother });
  }

  for (let i = 0; i < founders.length; i += 1) {
    const pair = founders[i];
    const count = founderChildCounts[i];
    for (let c = 0; c < count; c += 1) {
      const gender = rng() < 0.5 ? "male" : "female";
      const child = await createPersonNode({
        gender,
        birthYear: randInt(1960, 1981),
        branchTag: `gen2-blood-${i + 1}`
      });
      await createParentLink(pair.father, child);
      await createParentLink(pair.mother, child);
      gen2Blood.push(child);
    }
  }

  for (let i = 0; i < gen2CoupleChildCounts.length; i += 1) {
    const blood = gen2Blood[i];
    const spouse = await createPersonNode({
      gender: blood.gender === "male" ? "female" : "male",
      birthYear: blood.birthYear + randInt(-3, 3),
      branchTag: `gen2-spouse-${i + 1}`
    });
    await createCouple(blood, spouse, i % 5 === 0 ? "divorced" : "married");
    gen2Couples.push({ blood, spouse });
  }

  for (let i = 0; i < 8; i += 1) {
    const spouseNode = gen2Couples[i].spouse;
    const father = await createPersonNode({
      gender: "male",
      birthYear: spouseNode.birthYear - randInt(24, 35),
      branchTag: `spouse-parent-${i + 1}`
    });
    const mother = await createPersonNode({
      gender: "female",
      birthYear: spouseNode.birthYear - randInt(22, 33),
      branchTag: `spouse-parent-${i + 1}`
    });
    await createCouple(father, mother, "married");
    await createParentLink(father, spouseNode);
    await createParentLink(mother, spouseNode);
  }

  for (let i = 0; i < gen2Couples.length; i += 1) {
    const { blood, spouse } = gen2Couples[i];
    const childCount = gen2CoupleChildCounts[i];
    for (let c = 0; c < childCount; c += 1) {
      const gender = rng() < 0.5 ? "male" : "female";
      const minBirth = Math.max(1984, Math.min(blood.birthYear, spouse.birthYear) + 18);
      const maxBirth = Math.min(2012, minBirth + 15);
      const child = await createPersonNode({
        gender,
        birthYear: randInt(minBirth, Math.max(minBirth, maxBirth)),
        branchTag: `gen3-${i + 1}`
      });
      await createParentLink(blood, child);
      await createParentLink(spouse, child);
      gen3Children.push(child);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    const child = gen3Children[i * 2];
    const spouse = await createPersonNode({
      gender: child.gender === "male" ? "female" : "male",
      birthYear: child.birthYear + randInt(-2, 4),
      branchTag: `gen3-spouse-${i + 1}`
    });
    await createCouple(child, spouse, i === 3 ? "divorced" : "married");
  }

  const treeAnchorNode = gen2Blood[0];
  await createParentLink(
    { id: anchorRootId, fullName: "existing-root" },
    treeAnchorNode,
    "adoptive"
  );

  const tempParent = await createPersonNode({
    gender: "male",
    birthYear: 1991,
    branchTag: "delete-check"
  });
  const tempPartner = await createPersonNode({
    gender: "female",
    birthYear: 1993,
    branchTag: "delete-check"
  });
  const tempChild = await createPersonNode({
    gender: "female",
    birthYear: 2017,
    branchTag: "delete-check"
  });

  const tempPartnership = await createCouple(tempParent, tempPartner, "married");
  const tempLink = await createParentLink(tempParent, tempChild);

  await apiDelete(baseUrl, `/api/relationships/parent-child/${tempLink.id}`, "delete parent-child link");
  deleteChecks.push({ operation: "delete_parent_link", id: tempLink.id, ok: true });

  await apiDelete(baseUrl, `/api/partnerships/${tempPartnership.id}`, "delete partnership");
  deleteChecks.push({ operation: "delete_partnership", id: tempPartnership.id, ok: true });

  await apiDelete(baseUrl, `/api/persons/${tempChild.id}`, "delete temp child");
  await apiDelete(baseUrl, `/api/persons/${tempPartner.id}`, "delete temp partner");
  await apiDelete(baseUrl, `/api/persons/${tempParent.id}`, "delete temp parent");
  deleteChecks.push({ operation: "delete_person_batch", ids: [tempChild.id, tempPartner.id, tempParent.id], ok: true });

  createdPersonIds.delete(tempParent.id);
  createdPersonIds.delete(tempPartner.id);
  createdPersonIds.delete(tempChild.id);

  const finalSnapshot = await apiJson(
    baseUrl,
    "GET",
    `/api/tree/${targetSlug}/builder-snapshot?includeMedia=0`,
    undefined,
    "final snapshot"
  );

  const initialPeopleCount = initialSnapshot.people.length;
  const finalPeopleCount = finalSnapshot.people.length;
  const netPeople = finalPeopleCount - initialPeopleCount;
  if (netPeople !== 77) {
    throw new Error(`Unexpected net person delta: expected 77, got ${netPeople}`);
  }

  const finalPersonIds = new Set(finalSnapshot.people.map((person) => person.id));
  const missingCreatedIds = [...createdPersonIds].filter((id) => !finalPersonIds.has(id));
  if (missingCreatedIds.length > 0) {
    throw new Error(`Missing created people in final snapshot: ${missingCreatedIds.length}`);
  }

  const hasAnchorLink = finalSnapshot.parentLinks.some(
    (link) => link.parent_person_id === anchorRootId && link.child_person_id === treeAnchorNode.id
  );
  if (!hasAnchorLink) {
    throw new Error("Generated branch is not attached to existing root person");
  }

  const browser = await chromium.launch({ headless: true });
  let pageErrors = [];
  let consoleErrors = [];
  let badResponses = [];

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

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

    await page.goto(`${baseUrl}/tree/${targetSlug}/builder`);
    await page.waitForURL(`**/tree/${targetSlug}/builder`, { timeout: 90000 });
    await page.locator(".builder-layout-reworked").waitFor({ timeout: 90000 });
    await page.locator(".person-list-item").first().waitFor({ timeout: 90000 });
    await page.screenshot({ path: builderShotPath, fullPage: true });

    const publicPage = await context.newPage();
    const publicResponse = await publicPage.goto(`${baseUrl}/tree/${targetSlug}`, { waitUntil: "domcontentloaded" });
    if (!publicResponse || publicResponse.status() >= 400) {
      throw new Error(`Public tree route failed: ${publicResponse?.status() || "no response"}`);
    }
    await publicPage.waitForTimeout(1000);
    await publicPage.screenshot({ path: publicShotPath, fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }

  const report = {
    ok: true,
    timestamp,
    tree: {
      slug: targetSlug,
      id: treeId,
      rootPersonId: anchorRootId
    },
    summary: {
      initialPeopleCount,
      finalPeopleCount,
      netPeopleAdded: netPeople,
      finalParentLinks: finalSnapshot.parentLinks.length,
      finalPartnerships: finalSnapshot.partnerships.length,
      deleteChecks
    },
    generatedBranch: {
      createdPeople: createdPersonIds.size,
      sampleNames: createdPeople.slice(0, 20).map((node) => node.fullName),
      attachedToPersonId: treeAnchorNode.id
    },
    diagnostics: {
      pageErrors,
      consoleErrors,
      badResponses
    },
    artifacts: {
      reportPath,
      builderShotPath,
      publicShotPath
    }
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
