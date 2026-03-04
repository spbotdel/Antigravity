import fs from "node:fs";
import path from "node:path";

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
const baseUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const storageBucket = env.NEXT_PUBLIC_STORAGE_BUCKET || "tree-photos";
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const fixturePath = path.resolve("tests/fixtures/smoke-photo.png");
const timestamp = Date.now();
const slug = `smoke-family-${timestamp}`;
const ownerName = `Smoke Root ${timestamp}`;
const childName = `Smoke Child ${timestamp}`;
const editedChildName = `Smoke Child Edited ${timestamp}`;
const publicPhotoTitle = `Public Smoke Photo ${timestamp}`;
const membersPhotoTitle = `Members Smoke Photo ${timestamp}`;

function builderInspector(page) {
  return page.locator("aside.builder-inspector");
}

async function withRetries(label, task, attempts = 4) {
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
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError;
}

async function waitForBuilderReady(page) {
  await page.waitForURL(new RegExp(`.*/tree/${slug}/builder$`));
  await builderInspector(page).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Человек", exact: true }).waitFor({ timeout: 15000 });
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

async function deleteUserWithRetry(userId) {
  await withRetries(`deleteUser:${userId}`, async () => {
    const result = await supabase.auth.admin.deleteUser(userId);
    if (result.error) {
      throw result.error;
    }
    return result;
  });
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/dashboard");
}

async function createTree(page) {
  await page.getByLabel("Название дерева").fill(`Smoke Family ${timestamp}`);
  await page.getByLabel("Адрес ссылки").fill(slug);
  await page.getByLabel("Описание").fill("Automated smoke test tree.");
  await page.getByRole("button", { name: "Создать первое дерево" }).click();
  await page.waitForURL(new RegExp(`(/dashboard|/tree/${slug}/builder)$`));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto(`${baseUrl}/tree/${slug}/builder`);
    await page.waitForURL(`**/tree/${slug}/builder`);
    try {
      await waitForBuilderReady(page);
      return;
    } catch {
      if (attempt === 4) {
        throw new Error("Конструктор не стал доступен после создания дерева.");
      }
      await page.waitForTimeout(1500);
    }
  }
}

async function createPerson(page, values) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Человек", exact: true }).click();
  if (!values.preserveContext) {
    await inspector.getByRole("button", { name: "Новый человек", exact: true }).click();
  }
  const createSection = inspector.locator("section.builder-panel-stack");
  await createSection.locator('input[name="fullName"]').fill(values.fullName);
  await createSection.locator('input[name="gender"]').fill(values.gender);
  await createSection.locator('input[name="birthDate"]').fill(values.birthDate);
  await createSection.locator('input[name="birthPlace"]').fill(values.birthPlace);
  await createSection.locator('textarea[name="bio"]').fill(values.bio);
  if (!values.isLiving) {
    await createSection.locator('input[name="isLiving"]').uncheck();
  }
  await createSection.getByRole("button", { name: values.submitLabel || "Добавить человека" }).click();
  await page.getByRole("button", { name: new RegExp(values.fullName) }).first().waitFor({ timeout: 30000 });
}

async function startRelativeCreateFromCanvas(page, label) {
  const canvas = page.locator(".tree-canvas");
  await canvas.getByRole("button", { name: "Добавить связь" }).click();
  await canvas.getByRole("button", { name: label, exact: true }).click();
}

async function createRelatedPersonInline(page, values) {
  const canvas = page.locator(".tree-canvas");
  await canvas.locator('[data-create-field="fullName"]').fill(values.fullName);
  await canvas.locator('[data-create-field="birthPlace"]').fill(values.birthPlace);
  if (values.gender) {
    await canvas.locator('[data-create-field="gender"]').fill(values.gender);
  }
  if (values.birthDate) {
    await canvas.locator('[data-create-field="birthDate"]').fill(values.birthDate);
  }
  await canvas.getByRole("button", { name: values.submitLabel, exact: true }).click();
  await page.getByRole("button", { name: new RegExp(values.fullName) }).first().waitFor({ timeout: 30000 });
}

async function updateSelectedPersonInline(page, values) {
  const canvas = page.locator(".tree-canvas");
  if (values.fullName !== undefined) {
    await canvas.locator('input[data-field="fullName"]').fill(values.fullName);
  }
  if (values.birthPlace !== undefined) {
    await canvas.locator('input[data-field="birthPlace"]').fill(values.birthPlace);
  }
  if (values.gender !== undefined) {
    await canvas.locator('input[data-field="gender"]').fill(values.gender);
  }
  await canvas.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Данные человека обновлены.").waitFor({ timeout: 30000 });
}

async function addRelationship(page) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Связи", exact: true }).click();
  await inspector.locator(".builder-relation-card").filter({ hasText: ownerName }).first().waitFor({ timeout: 30000 });
}

async function configureTree(page) {
  await page.goto(`${baseUrl}/tree/${slug}/settings`);
  await page.getByLabel("Корневой человек").selectOption({ label: ownerName });
  await page.getByRole("button", { name: "Сохранить данные" }).click();
  await page.getByText("Данные дерева обновлены.").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Сделать открытым" }).click();
  await page.getByText("Видимость дерева обновлена.").waitFor({ timeout: 30000 });
}

async function uploadPhoto(page, title, visibility) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`);
  await waitForBuilderReady(page);
  await page.getByRole("button", { name: new RegExp(ownerName) }).first().click();
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Медиа", exact: true }).click();
  const photoForm = inspector.locator("form").nth(0);
  await photoForm.getByLabel("Фото").setInputFiles(fixturePath);
  await photoForm.getByLabel("Название").fill(title);
  await photoForm.getByLabel("Подпись").fill(`${title} caption`);
  await photoForm.getByLabel("Видимость").selectOption(visibility);
  await photoForm.getByRole("button", { name: "Загрузить фото" }).click();
  await page.getByText("Фотография сохранена.").waitFor({ timeout: 30000 });
  await inspector.getByRole("heading", { name: title, exact: true }).first().waitFor({ timeout: 30000 });
}

async function createInvite(page, role, email) {
  await page.goto(`${baseUrl}/tree/${slug}/members`);
  await page.getByLabel("Роль").selectOption(role);
  await page.getByLabel("Способ приглашения").selectOption("link");
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Создать приглашение" }).click();
  const success = page.locator(".inline-feedback-card-success").filter({ hasText: "Приглашение готово" });
  await success.waitFor();
  return (await success.locator("p").textContent()).trim();
}

async function acceptInvite(browser, user, inviteUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user.email, user.password);
  const normalizedInviteUrl = inviteUrl.replace("http://localhost:3000", baseUrl);
  await page.goto(normalizedInviteUrl);
  await page.getByRole("button", { name: "Принять приглашение" }).click();
  await page.waitForURL(`**/tree/${slug}`);
  return { context, page };
}

async function assertAnonymousVisibility(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/tree/${slug}`);
  await page.getByRole("heading", { name: publicPhotoTitle, exact: true }).first().waitFor();
  const membersVisible = await page.getByRole("heading", { name: membersPhotoTitle, exact: true }).count();
  if (membersVisible !== 0) {
    throw new Error("Анонимный посетитель видит заголовок фото только для участников.");
  }
  await context.close();
}

async function verifyDbState(ownerEmail, adminEmail, viewerEmail) {
  const treeRes = await supabase.from("trees").select("id,slug,visibility,title").eq("slug", slug).single();
  if (treeRes.error) {
    throw new Error(treeRes.error.message || "Не удалось найти дерево для проверки.");
  }

  const [mediaRes, profilesRes] = await Promise.all([
    supabase.from("media_assets").select("id,title,visibility,kind").eq("tree_id", treeRes.data.id),
    supabase.from("profiles").select("email").in("email", [ownerEmail, adminEmail, viewerEmail])
  ]);

  if (mediaRes.error || profilesRes.error) {
    throw new Error(mediaRes.error?.message || profilesRes.error?.message || "Проверка базы данных завершилась ошибкой.");
  }

  return {
    tree: treeRes.data,
    mediaCount: mediaRes.data.length,
    profileCount: profilesRes.data.length
  };
}

async function cleanupArtifacts(userIds) {
  const treeRes = await supabase.from("trees").select("id").eq("slug", slug).maybeSingle();

  if (treeRes.data?.id) {
    const treeId = treeRes.data.id;
    const mediaRes = await supabase.from("media_assets").select("id,storage_path").eq("tree_id", treeId);
    const mediaIds = (mediaRes.data || []).map((item) => item.id);
    const storagePaths = (mediaRes.data || []).map((item) => item.storage_path).filter(Boolean);

    if (storagePaths.length) {
      await supabase.storage.from(storageBucket).remove(storagePaths);
    }

    if (mediaIds.length) {
      await supabase.from("person_media").delete().in("media_id", mediaIds);
    }
    await supabase.from("media_assets").delete().eq("tree_id", treeId);
    await supabase.from("person_parent_links").delete().eq("tree_id", treeId);
    await supabase.from("person_partnerships").delete().eq("tree_id", treeId);
    await supabase.from("tree_invites").delete().eq("tree_id", treeId);
    await supabase.from("tree_memberships").delete().eq("tree_id", treeId);
    await supabase.from("audit_log").delete().eq("tree_id", treeId);
    await supabase.from("persons").delete().eq("tree_id", treeId);
    await supabase.from("trees").delete().eq("id", treeId);
  }

  for (const userId of userIds.filter(Boolean)) {
    try {
      await deleteUserWithRetry(userId);
    } catch (error) {
      console.warn(`cleanup warning: failed to delete user ${userId}`, error);
    }
  }
}

async function main() {
  const owner = await createUser("owner");
  const admin = await createUser("admin");
  const viewer = await createUser("viewer");
  const createdUserIds = [owner.id, admin.id, viewer.id];

  const browser = await chromium.launch({ headless: true });

  try {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, owner.email, owner.password);
    await createTree(ownerPage);
    await createPerson(ownerPage, {
      fullName: ownerName,
      gender: "male",
      birthDate: "1955-05-05",
      birthPlace: "Moscow",
      bio: "Automated owner root profile.",
      isLiving: true
    });
    await startRelativeCreateFromCanvas(ownerPage, "Ребенок");
    await createRelatedPersonInline(ownerPage, {
      fullName: childName,
      gender: "female",
      birthDate: "1990-10-10",
      birthPlace: "Kazan",
      submitLabel: "Добавить ребенка"
    });
    await updateSelectedPersonInline(ownerPage, {
      fullName: editedChildName,
      birthPlace: "Kazan Updated"
    });
    await addRelationship(ownerPage);
    await configureTree(ownerPage);
    await uploadPhoto(ownerPage, publicPhotoTitle, "public");
    await uploadPhoto(ownerPage, membersPhotoTitle, "members");

    const adminInvite = await createInvite(ownerPage, "admin", admin.email);
    const viewerInvite = await createInvite(ownerPage, "viewer", viewer.email);

    const adminSession = await acceptInvite(browser, admin, adminInvite);
    await adminSession.page.goto(`${baseUrl}/tree/${slug}/builder`);
    await waitForBuilderReady(adminSession.page);
    await adminSession.page.locator(".person-list-item").first().waitFor({ timeout: 30000 });
    await adminSession.context.close();

    const viewerSession = await acceptInvite(browser, viewer, viewerInvite);
    await viewerSession.page.getByRole("heading", { name: publicPhotoTitle, exact: true }).first().waitFor();
    await viewerSession.page.getByRole("heading", { name: membersPhotoTitle, exact: true }).first().waitFor();
    await viewerSession.page.goto(`${baseUrl}/tree/${slug}/builder`);
    await viewerSession.page.waitForURL(`**/tree/${slug}`);
    await viewerSession.context.close();

    await assertAnonymousVisibility(browser);

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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
