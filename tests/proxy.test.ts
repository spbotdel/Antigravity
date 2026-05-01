import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFamilyDomainHost = process.env.FAMILY_DOMAIN_HOST;
const originalFamilyDomainTreeSlug = process.env.FAMILY_DOMAIN_TREE_SLUG;

async function loadProxyWithEnv(env?: { host?: string; treeSlug?: string }) {
  vi.resetModules();
  if (env?.host) {
    process.env.FAMILY_DOMAIN_HOST = env.host;
  } else {
    delete process.env.FAMILY_DOMAIN_HOST;
  }

  if (env?.treeSlug) {
    process.env.FAMILY_DOMAIN_TREE_SLUG = env.treeSlug;
  } else {
    delete process.env.FAMILY_DOMAIN_TREE_SLUG;
  }

  return import("../proxy");
}

function createRequest(url: string) {
  return new NextRequest(url);
}

function getRewriteUrl(response: Response) {
  return response.headers.get("x-middleware-rewrite");
}

function getRedirectUrl(response: Response) {
  return response.headers.get("location");
}

describe("family-domain proxy routing", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FAMILY_DOMAIN_HOST;
    delete process.env.FAMILY_DOMAIN_TREE_SLUG;
  });

  afterEach(() => {
    vi.resetModules();
    if (originalFamilyDomainHost === undefined) {
      delete process.env.FAMILY_DOMAIN_HOST;
    } else {
      process.env.FAMILY_DOMAIN_HOST = originalFamilyDomainHost;
    }

    if (originalFamilyDomainTreeSlug === undefined) {
      delete process.env.FAMILY_DOMAIN_TREE_SLUG;
    } else {
      process.env.FAMILY_DOMAIN_TREE_SLUG = originalFamilyDomainTreeSlug;
    }
  });

  it.each([
    ["/", "/tree/popovi"],
    ["/media", "/tree/popovi/media"],
    ["/builder", "/tree/popovi/builder"],
    ["/settings", "/tree/popovi/settings"],
    ["/members", "/tree/popovi/members"],
    ["/audit", "/tree/popovi/audit"],
  ])("rewrites family host %s to %s", async (cleanPath, internalPath) => {
    const { proxy } = await loadProxyWithEnv({ host: "popovi.ru", treeSlug: "popovi" });

    const response = await proxy(createRequest(`https://popovi.ru${cleanPath}`));

    expect(getRewriteUrl(response)).toBe(`https://popovi.ru${internalPath}`);
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("preserves query params when rewriting clean family paths", async () => {
    const { proxy } = await loadProxyWithEnv({ host: "popovi.ru", treeSlug: "popovi" });

    const response = await proxy(createRequest("https://popovi.ru/media?share=family-token&view=person"));

    expect(getRewriteUrl(response)).toBe("https://popovi.ru/tree/popovi/media?share=family-token&view=person");
  });

  it.each([
    ["/tree/popovi", "/"],
    ["/tree/popovi/media", "/media"],
    ["/tree/popovi/builder", "/builder"],
    ["/tree/popovi/settings", "/settings"],
    ["/tree/popovi/members", "/members"],
    ["/tree/popovi/audit", "/audit"],
  ])("redirects family host %s to %s", async (internalPath, cleanPath) => {
    const { proxy } = await loadProxyWithEnv({ host: "popovi.ru", treeSlug: "popovi" });

    const response = await proxy(createRequest(`https://popovi.ru${internalPath}?share=family-token`));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe(`https://popovi.ru${cleanPath}?share=family-token`);
    expect(getRewriteUrl(response)).toBeNull();
  });

  it("normalizes the configured and request host before matching", async () => {
    const { proxy } = await loadProxyWithEnv({ host: "POPovi.RU", treeSlug: "popovi" });

    const response = await proxy(createRequest("https://popovi.ru:443/settings"));

    expect(getRewriteUrl(response)).toBe("https://popovi.ru/tree/popovi/settings");
  });

  it("does nothing when family-domain env is absent", async () => {
    const { proxy } = await loadProxyWithEnv();

    const response = await proxy(createRequest("https://popovi.ru/settings"));

    expect(getRewriteUrl(response)).toBeNull();
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("does nothing on unconfigured hosts", async () => {
    const { proxy } = await loadProxyWithEnv({ host: "popovi.ru", treeSlug: "popovi" });

    const response = await proxy(createRequest("https://antigravity-zeta-two.vercel.app/tree/popovi"));

    expect(getRewriteUrl(response)).toBeNull();
    expect(getRedirectUrl(response)).toBeNull();
  });

  it.each([
    "/api/trees",
    "/_next/static/chunk.js",
    "/auth/login",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/icon.svg",
    "/apple-touch-icon.png",
    "/assets/site.css",
    "/images/family.webp",
    "/files/data.json",
    "/font.woff2",
  ])("does not rewrite excluded path %s", async (path) => {
    const { proxy } = await loadProxyWithEnv({ host: "popovi.ru", treeSlug: "popovi" });

    const response = await proxy(createRequest(`https://popovi.ru${path}`));

    expect(getRewriteUrl(response)).toBeNull();
    expect(getRedirectUrl(response)).toBeNull();
  });
});
