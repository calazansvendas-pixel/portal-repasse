"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutDashboard, Search, ShieldCheck, UploadCloud, Workflow } from "lucide-react";
import { nomeDoCargo } from "@/lib/auth/cargos";
import { menusVisiveis, type MenuId } from "@/lib/auth/menus";
import type { UserProfile } from "@/lib/types";
import { ROLE_LABEL, ASSISTENTE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const CHAVE_RECOLHIDA = "sidebar-recolhida";

const ICONES: Record<MenuId, typeof LayoutDashboard> = {
  painel: LayoutDashboard,
  auditoria: UploadCloud,
  dossie: Search,
  motor_regras: Workflow,
  painel_admin: ShieldCheck,
};

export function Sidebar({ profile }: { profile: UserProfile }) {
  const pathname = usePathname();
  const items = menusVisiveis(profile).map((m) => ({ href: m.rota, label: m.nome, icon: ICONES[m.id] }));
  // Só afeta o layout em telas >= lg (o nav mobile já é compacto por conta própria).
  const [recolhida, setRecolhida] = useState(false);

  useEffect(() => {
    try {
      setRecolhida(localStorage.getItem(CHAVE_RECOLHIDA) === "1");
    } catch {
      // localStorage indisponível (modo privado, etc.) — segue expandida
    }
  }, []);

  function alternarRecolhida() {
    setRecolhida((atual) => {
      const novo = !atual;
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, novo ? "1" : "0");
      } catch {
        // sem persistência — o toggle ainda funciona nesta sessão
      }
      return novo;
    });
  }

  const cargo = nomeDoCargo(profile.cargo);
  const subtitulo =
    profile.role === "assistente" && profile.praca
      ? [cargo, ASSISTENTE_LABEL[profile.praca]].filter(Boolean).join(" · ")
      : cargo ?? ROLE_LABEL[profile.role];

  return (
    <aside
      className={cn(
        "surface-card flex w-full shrink-0 flex-col gap-3 p-3 lg:gap-6 lg:p-5 lg:transition-[width]",
        recolhida ? "lg:w-[76px]" : "lg:w-60"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Image
          src="/logos/logo-morar-verde.png"
          alt="Morar"
          width={120}
          height={34}
          className={cn("h-8 w-auto object-contain", recolhida && "lg:hidden")}
        />
        {/* No celular o cartão do usuário vem para o topo, ao lado do logo */}
        <p className="min-w-0 truncate text-right text-xs text-ink-secondary lg:hidden dark:text-white/60">
          <span className="font-semibold text-ink-primary dark:text-white">{profile.nome}</span> · {subtitulo}
        </p>
        <button
          type="button"
          onClick={alternarRecolhida}
          title={recolhida ? "Expandir menu" : "Recolher menu"}
          className="hidden shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-primary lg:flex dark:hover:bg-white/10 dark:hover:text-white"
        >
          {recolhida ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {items.map((item) => {
          // "startsWith" destacaria "/auditoria" junto com "/auditoria/cliente" ao mesmo tempo —
          // só vale para quem não tem uma rota-filha própria na lista.
          const temFilhoNaLista = items.some((outro) => outro !== item && outro.href.startsWith(item.href + "/"));
          const ativo = pathname === item.href || (!temFilhoNaLista && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={recolhida ? item.label : undefined}
              className={cn(
                "flex min-h-[44px] shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                recolhida && "lg:justify-center lg:px-2",
                ativo
                  ? "bg-brand-primary text-white"
                  : "text-ink-secondary hover:bg-surface-soft dark:text-white/70 dark:hover:bg-white/5"
              )}
            >
              <Icon size={18} />
              <span className={cn(recolhida && "lg:hidden")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto hidden rounded-md bg-surface-green px-3 py-3 text-xs text-ink-secondary lg:block dark:bg-white/5 dark:text-white/60",
          recolhida && "lg:hidden"
        )}
      >
        <p className="font-semibold text-ink-primary dark:text-white">{profile.nome}</p>
        <p>{subtitulo}</p>
      </div>
    </aside>
  );
}
