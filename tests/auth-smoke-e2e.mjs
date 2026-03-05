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

const timestamp = Date.now();
const email = `register.smoke.${timestamp}@gmail.com`;
const password = "SmokeRegister123!";
const displayName = `Smoke Owner ${timestamp}`;
const treeTitle = `Smoke Register Tree ${timestamp}`;
const slug = `smoke-register-${timestamp}`;
const registrationConfirmationMessage = "Аккаунт создан. Подтвердите почту, затем войдите и создайте свое дерево из панели управления.";

function builderInspector(page) {
  return page.locator("aside.builder-inspector");
}

async function waitForBuilderReady(page, timeout = 20000) {
  await page.waitForURL(new RegExp(`.*/tree/${slug}/builder$`), { timeout });
  await builderInspector(page).waitFor({ timeout });
  await page.getByRole("button", { name: "Человек", exact: true }).waitFor({ timeout });
}

async function findUserIdByEmail() {
  for (let currentPage = 1; currentPage <= 10; currentPage += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: currentPage, perPage: 200 });
    if (error) {
      throw error;
    }

    const user = data.users.find((entry) => entry.email === email);
    if (user) {
      return user.id;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  const profileRes = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  return profileRes.data?.id || null;
}

async function confirmUserIfNeeded() {
  const userId = await findUserIdByEmail();
  if (!userId) {
    throw new Error("Не удалось найти пользователя после регистрации.");
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) {
    throw error;
  }

  return userId;
}

async function ensureFallbackUser() {
  const existingUserId = await findUserIdByEmail();
  if (existingUserId) {
    return existingUserId;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName
    }
  });

  if (error) {
    throw error;
  }

  return data.user.id;
}

async function login(page, userEmail, userPassword) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel("Почта").fill(userEmail);
  await page.getByLabel("Пароль").fill(userPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page) {
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL(`${baseUrl}/`);
}

async function createTreeFromDashboard(page) {
  await page.getByLabel("Название дерева").fill(treeTitle);
  await page.getByLabel("Адрес ссылки").fill(slug);
  await page.getByLabel("Описание").fill("Tree created from auth smoke after confirmed signup.");
  await page.getByRole("button", { name: "Создать первое дерево" }).click();
  await waitForBuilderReady(page, 30000);
}

async function waitForRegistrationOutcome(page) {
  const successMessage = page.getByText(registrationConfirmationMessage);
  const formError = page.locator(".form-error").first();

  for (let step = 0; step < 40; step += 1) {
    try {
      await waitForBuilderReady(page, 500);
      return { registrationMode: "session" };
    } catch {}

    if (await successMessage.isVisible().catch(() => false)) {
      return { registrationMode: "confirm_email" };
    }

    if (await formError.isVisible().catch(() => false)) {
      return {
        registrationMode: "error",
        errorText: ((await formError.textContent()) || "").trim()
      };
    }

    await page.waitForTimeout(500);
  }

  return { registrationMode: "timeout", errorText: "Регистрация не завершилась ожидаемым переходом или сообщением." };
}

async function registerOwner(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(`${baseUrl}/auth/register`);
    await page.getByLabel("Ваше имя").fill(displayName);
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByLabel("Адрес ссылки").fill(slug);
    await page.getByLabel("Название семейного дерева").fill(treeTitle);
    await page.getByLabel("Описание").fill("UI auth smoke registration flow.");
    await page.getByRole("button", { name: "Зарегистрировать владельца" }).click();

    const outcome = await waitForRegistrationOutcome(page);
    if (outcome.registrationMode !== "error") {
      return outcome;
    }

    const errorText = outcome.errorText || "";
    const isRateLimited =
      errorText.includes("email rate limit exceeded") ||
      errorText.includes("Слишком много попыток регистрации подряд");

    if (isRateLimited && attempt === 0) {
      await page.waitForTimeout(75000);
      continue;
    }

    if (isRateLimited) {
      return { registrationMode: "rate_limited" };
    }

    if (outcome.errorText?.includes("Пользователь с такой почтой уже зарегистрирован.") || outcome.errorText?.includes("User already registered")) {
      return { registrationMode: "existing_user" };
    }

    throw new Error(`Регистрация завершилась ошибкой: ${outcome.errorText || "неизвестная ошибка"}`);
  }

  throw new Error("Регистрация не удалась из-за rate limit Supabase auth после повторной попытки.");
}

async function assertInvalidLoginError(page) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(`${password}-wrong`);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByText("Неверная почта или пароль.").waitFor({ timeout: 15000 });
}

async function cleanupArtifacts(userId) {
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

  if (userId) {
    await supabase.auth.admin.deleteUser(userId);
  }
}

async function main() {
  let userId = null;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const { registrationMode } = await registerOwner(page);
    userId = await findUserIdByEmail();

    if (registrationMode === "rate_limited") {
      userId = await ensureFallbackUser();
      await login(page, email, password);
      await createTreeFromDashboard(page);
    } else if (registrationMode !== "session") {
      userId = await confirmUserIfNeeded();
      await login(page, email, password);

      const createFormVisible = await page.getByLabel("Название дерева").isVisible().catch(() => false);
      if (createFormVisible) {
        await createTreeFromDashboard(page);
      } else {
        await page.getByText(treeTitle, { exact: true }).waitFor({ timeout: 20000 });
      }
    }

    await signOut(page);
    await assertInvalidLoginError(page);
    await login(page, email, password);
    await page.getByText(treeTitle, { exact: true }).waitFor({ timeout: 20000 });
    await page.getByRole("link", { name: "Продолжить редактирование" }).click();
    await waitForBuilderReady(page, 30000);

    console.log(
      JSON.stringify(
        {
          ok: true,
          email,
          slug,
          registrationMode
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    await cleanupArtifacts(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
