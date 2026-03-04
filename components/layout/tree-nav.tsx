"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface TreeNavProps {
  slug: string;
  canEdit?: boolean;
  canManageMembers?: boolean;
  canReadAudit?: boolean;
  canManageSettings?: boolean;
}

export function TreeNav({ slug, canEdit, canManageMembers, canReadAudit, canManageSettings }: TreeNavProps) {
  const pathname = usePathname();

  const items = [
    { href: `/tree/${slug}`, label: "Просмотр", visible: true },
    { href: `/tree/${slug}/builder`, label: "Конструктор", visible: Boolean(canEdit) },
    { href: `/tree/${slug}/members`, label: "Участники", visible: Boolean(canManageMembers) },
    { href: `/tree/${slug}/settings`, label: "Настройки", visible: Boolean(canManageSettings) },
    { href: `/tree/${slug}/audit`, label: "Журнал", visible: Boolean(canReadAudit) }
  ];

  return (
    <nav className="pill-nav">
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <Link key={item.href} href={item.href} className={cn("pill-link", pathname === item.href && "pill-link-active")}>
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
