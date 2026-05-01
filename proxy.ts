import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";

const cleanPathToTreePath = new Map([
  ["/", ""],
  ["/media", "/media"],
  ["/builder", "/builder"],
  ["/settings", "/settings"],
  ["/members", "/members"],
  ["/audit", "/audit"]
]);

const staticFilePattern = /\.(?:png|jpg|jpeg|webp|svg|ico|css|js|txt|xml|json|map|woff|woff2)$/i;

function normalizeHost(host: string | null) {
  if (!host) {
    return "";
  }

  const normalizedHost = host.trim().toLowerCase();
  if (normalizedHost.startsWith("[")) {
    const closingBracketIndex = normalizedHost.indexOf("]");
    return closingBracketIndex >= 0 ? normalizedHost.slice(1, closingBracketIndex) : normalizedHost;
  }

  return normalizedHost.split(":")[0] || "";
}

function normalizePathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function getFamilyDomainConfig() {
  const host = normalizeHost(process.env.FAMILY_DOMAIN_HOST || null);
  const treeSlug = process.env.FAMILY_DOMAIN_TREE_SLUG?.trim().replace(/^\/+|\/+$/g, "") || "";

  if (!host || !treeSlug) {
    return null;
  }

  return { host, treeSlug };
}

function shouldBypassFamilyRouting(pathname: string) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/_next/") ||
    pathname === "/_next" ||
    pathname.startsWith("/auth/") ||
    pathname === "/auth" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname.startsWith("/assets/") ||
    pathname === "/assets" ||
    pathname.startsWith("/images/") ||
    pathname === "/images" ||
    staticFilePattern.test(pathname)
  );
}

function getInternalTreePrefix(treeSlug: string) {
  return `/tree/${encodeURIComponent(treeSlug)}`;
}

export async function proxy(request: NextRequest) {
  const familyDomainConfig = getFamilyDomainConfig();
  if (!familyDomainConfig) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const requestHost = normalizeHost(request.headers.get("host") || request.nextUrl.host);
  if (requestHost !== familyDomainConfig.host) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const pathname = normalizePathname(request.nextUrl.pathname);
  if (shouldBypassFamilyRouting(pathname)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const internalTreePrefix = getInternalTreePrefix(familyDomainConfig.treeSlug);
  if (pathname === internalTreePrefix || pathname.startsWith(`${internalTreePrefix}/`)) {
    const internalSuffix = pathname.slice(internalTreePrefix.length) || "/";
    const cleanPathname = internalSuffix === "/" ? "/" : internalSuffix;
    if (cleanPathToTreePath.has(cleanPathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = cleanPathname;
      return NextResponse.redirect(redirectUrl, 307);
    }
  }

  const internalSuffix = cleanPathToTreePath.get(pathname);
  if (internalSuffix !== undefined) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `${internalTreePrefix}${internalSuffix}`;
    return NextResponse.rewrite(rewriteUrl, { request: { headers: request.headers } });
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
