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
const adminKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!adminKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for smoke e2e admin operations.");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false }
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

async function provisionTreeForOwner(ownerUserId) {
  const treeRes = await supabase
    .from("trees")
    .insert({
      owner_user_id: ownerUserId,
      title: treeTitle,
      slug,
      description: "Automated smoke test tree.",
      visibility: "private"
    })
    .select("id")
    .single();

  if (treeRes.error || !treeRes.data?.id) {
    throw treeRes.error || new Error("Не удалось создать дерево для smoke-сценария.");
  }

  const membershipRes = await supabase.from("tree_memberships").insert({
    tree_id: treeRes.data.id,
    user_id: ownerUserId,
    role: "owner",
    status: "active"
  });

  if (membershipRes.error) {
    throw membershipRes.error;
  }

  return treeRes.data.id;
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

async function createPerson(page, values) {
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Человек", exact: true }).click();
  if (!values.preserveContext) {
    await inspector.getByRole("button", { name: "Новый человек", exact: true }).click();
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
}

async function uploadMediaFile(page, title, visibility) {
  await page.goto(`${baseUrl}/tree/${slug}/builder`);
  await waitForBuilderReady(page);
  await page.getByRole("button", { name: new RegExp(ownerName) }).first().click();
  const inspector = builderInspector(page);
  await inspector.getByRole("button", { name: "Медиа", exact: true }).click();
  const photoForm = inspector.locator("form").nth(0);
  await photoForm.getByLabel("Файл").setInputFiles(fixturePath);
  await photoForm.getByLabel("Название").fill(title);
  await photoForm.getByLabel("Подпись").fill(`${title} caption`);
  await photoForm.getByLabel("Видимость").selectOption(visibility);
  await photoForm.getByRole("button", { name: "Загрузить файл" }).click();
  await page.getByText("Файл сохранен.").waitFor({ timeout: 30000 });
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

async function createShareLink(page, label) {
  await page.goto(`${baseUrl}/tree/${slug}/members`);
  const shareSection = page.locator("section").filter({ hasText: "Ссылка для просмотра без аккаунта" }).first();
  await shareSection.locator('input[name="label"]').fill(label);
  await shareSection.locator('input[name="expiresInDays"]').fill("14");
  await shareSection.getByRole("button", { name: "Создать ссылку для просмотра" }).click();
  const success = page.locator(".inline-feedback-card-success").filter({ hasText: "Ссылка готова" });
  await success.waitFor();
  return (await success.locator("p").textContent()).trim();
}

async function revokeShareLink(page) {
  await page.goto(`${baseUrl}/tree/${slug}/members`);
  const shareListSection = page.locator("section").filter({ hasText: "Ссылки для семейного просмотра" }).last();
  await shareListSection.getByRole("button", { name: "Отозвать ссылку", exact: true }).click();
  await shareListSection.getByText("Отозвана").first().waitFor({ timeout: 30000 });
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

async function assertPrivateTreeBlocked(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/tree/${slug}`);
  await page.getByRole("heading", { name: "Дерево недоступно" }).waitFor();
  await context.close();
}

async function assertShareLinkVisibility(browser, shareUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const normalizedShareUrl = shareUrl.replace("http://localhost:3000", baseUrl);
  await page.goto(normalizedShareUrl);
  await page.getByRole("heading", { name: publicPhotoTitle, exact: true }).first().waitFor();
  await page.getByRole("heading", { name: membersPhotoTitle, exact: true }).first().waitFor();
  await page.getByRole("heading", { name: adminPhotoTitle, exact: true }).first().waitFor();
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
  await page.goto(normalizedShareUrl);
  await page.getByRole("heading", { name: "Дерево недоступно" }).waitFor();
  await context.close();
}

async function verifyDbState(ownerEmail, adminEmail, viewerEmail) {
  const treeRes = await supabase.from("trees").select("id,slug,visibility,title").eq("slug", slug).single();
  if (treeRes.error) {
    throw new Error(treeRes.error.message || "Не удалось найти дерево для проверки.");
  }

  const [mediaRes, profilesRes, shareLinksRes] = await Promise.all([
    supabase.from("media_assets").select("id,title,visibility,kind").eq("tree_id", treeRes.data.id),
    supabase.from("profiles").select("email").in("email", [ownerEmail, adminEmail, viewerEmail]),
    supabase.from("tree_share_links").select("id,revoked_at").eq("tree_id", treeRes.data.id)
  ]);

  if (mediaRes.error || profilesRes.error || shareLinksRes.error) {
    throw new Error(mediaRes.error?.message || profilesRes.error?.message || shareLinksRes.error?.message || "Проверка базы данных завершилась ошибкой.");
  }

  return {
    tree: treeRes.data,
    mediaCount: mediaRes.data.length,
    profileCount: profilesRes.data.length,
    shareLinkCount: shareLinksRes.data.length,
    revokedShareLinkCount: shareLinksRes.data.filter((item) => item.revoked_at).length
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
    await supabase.from("tree_share_links").delete().eq("tree_id", treeId);
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
  await provisionTreeForOwner(owner.id);

  const browser = await chromium.launch({ headless: true });

  try {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await login(ownerPage, owner.email, owner.password);
    await ownerPage.goto(`${baseUrl}/tree/${slug}/builder`);
    await waitForBuilderReady(ownerPage);
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
    await uploadMediaFile(ownerPage, publicPhotoTitle, "public");
    await uploadMediaFile(ownerPage, membersPhotoTitle, "members");

    const adminInvite = await createInvite(ownerPage, "admin", admin.email);
    const viewerInvite = await createInvite(ownerPage, "viewer", viewer.email);

    const adminSession = await acceptInvite(browser, admin, adminInvite);
    await adminSession.page.goto(`${baseUrl}/tree/${slug}/builder`);
    await waitForBuilderReady(adminSession.page);
    await adminSession.page.locator(".person-list-item").first().waitFor({ timeout: 30000 });
    await uploadMediaFile(adminSession.page, adminPhotoTitle, "members");
    await adminSession.context.close();

    const viewerSession = await acceptInvite(browser, viewer, viewerInvite);
    await viewerSession.page.getByRole("heading", { name: publicPhotoTitle, exact: true }).first().waitFor();
    await viewerSession.page.getByRole("heading", { name: membersPhotoTitle, exact: true }).first().waitFor();
    await viewerSession.page.getByRole("heading", { name: adminPhotoTitle, exact: true }).first().waitFor();
    await viewerSession.page.goto(`${baseUrl}/tree/${slug}/builder`);
    await viewerSession.page.waitForURL(`**/tree/${slug}`);
    await viewerSession.context.close();

    const shareUrl = await createShareLink(ownerPage, `Smoke Share ${timestamp}`);
    await assertPrivateTreeBlocked(browser);
    await assertShareLinkVisibility(browser, shareUrl);
    await revokeShareLink(ownerPage);
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
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
