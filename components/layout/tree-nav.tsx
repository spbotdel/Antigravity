"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface TreeNavProps {
  slug: string;
  shareToken?: string | null;
  canEdit?: boolean;
  canManageMembers?: boolean;
  canReadAudit?: boolean;
  canManageSettings?: boolean;
}

function withShareToken(href: string, shareToken?: string | null) {
  if (!shareToken) {
    return href;
  }

  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}share=${encodeURIComponent(shareToken)}`;
}

export function TreeNav({ slug, shareToken, canEdit, canManageMembers, canReadAudit, canManageSettings }: TreeNavProps) {
  const pathname = usePathname();

  const items = [
    { href: withShareToken(`/tree/${slug}`, shareToken), pathname: `/tree/${slug}`, label: "Просмотр", visible: true },
    { href: withShareToken(`/tree/${slug}/builder`, shareToken), pathname: `/tree/${slug}/builder`, label: "Конструктор", visible: Boolean(canEdit) },
    { href: withShareToken(`/tree/${slug}/media`, shareToken), pathname: `/tree/${slug}/media`, label: "Медиа", visible: true },
    { href: withShareToken(`/tree/${slug}/members`, shareToken), pathname: `/tree/${slug}/members`, label: "Участники", visible: Boolean(canManageMembers) },
    { href: withShareToken(`/tree/${slug}/settings`, shareToken), pathname: `/tree/${slug}/settings`, label: "Настройки", visible: Boolean(canManageSettings) },
    { href: withShareToken(`/tree/${slug}/audit`, shareToken), pathname: `/tree/${slug}/audit`, label: "Журнал", visible: Boolean(canReadAudit) }
  ];

  return (
    <nav className="pill-nav">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <Link key={item.href} href={item.href} prefetch={false} className={cn("pill-link", pathname === item.pathname && "pill-link-active")}>
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
