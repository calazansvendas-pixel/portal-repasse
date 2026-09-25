"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UploadCloud } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { ROLE_LABEL, ASSISTENTE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

function navItemsPara(profile: UserProfile): NavItem[] {
  const items: NavItem[] = [{ href: "/dashboard", label: "Painel", icon: LayoutDashboard }];

  if (profile.role === "gerencia" || profile.role === "coordenador" || profile.role === "analista") {
    items.push({ href: "/auditoria", label: "Auditoria de Planilha", icon: UploadCloud });
  }

  return items;
}

export function Sidebar({ profile }: { profile: UserProfile }) {
  const pathname = usePathname();
  const items = navItemsPara(profile);

  const subtitulo =
    profile.role === "assistente" && profile.praca
      ? ASSISTENTE_LABEL[profile.praca]
      : ROLE_LABEL[profile.role];

  return (
    <aside className="surface-card flex w-60 shrink-0 flex-col gap-6 p-5">
      <Image
        src="/logos/logo-morar-verde.png"
        alt="Morar"
        width={120}
        height={34}
        className="h-8 w-auto object-contain"
      />

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                ativo
                  ? "bg-brand-primary text-white"
                  : "text-ink-secondary hover:bg-surface-soft dark:text-white/70 dark:hover:bg-white/5"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-md bg-surface-green px-3 py-3 text-xs text-ink-secondary dark:bg-white/5 dark:text-white/60">
        <p className="font-semibold text-ink-primary dark:text-white">{profile.nome}</p>
        <p>{subtitulo}</p>
      </div>
    </aside>
  );
}
