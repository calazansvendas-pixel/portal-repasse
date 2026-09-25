"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({ titulo, mostrarVoltar = false }: { titulo: string; mostrarVoltar?: boolean }) {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {mostrarVoltar && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Voltar"
            title="Voltar"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-ink-secondary transition-colors hover:bg-surface-soft dark:border-white/15 dark:bg-[#1B1E17] dark:text-white/80 dark:hover:bg-white/5"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <h1 className="min-w-0 truncate text-lg font-bold text-ink-primary sm:text-xl dark:text-white">{titulo}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => signOut()}
          aria-label="Sair"
          title="Sair"
          className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-ink-secondary transition-colors hover:bg-status-danger/10 hover:text-status-danger dark:border-white/15 dark:bg-[#1B1E17] dark:text-white/80"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
