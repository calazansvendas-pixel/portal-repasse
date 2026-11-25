"use client";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { assinarAvisos, fecharAviso, lerAvisos, lerAvisosNoServidor } from "@/lib/store/avisos";

/** Pilha de avisos no canto da tela. Montado uma vez, no layout do painel. */
export function Avisos() {
  const avisos = useSyncExternalStore(assinarAvisos, lerAvisos, lerAvisosNoServidor);
  if (avisos.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4">
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tom === "erro" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-surface p-3 text-sm shadow-md dark:bg-[#1B1E17]",
            a.tom === "erro" ? "border-status-danger/30 text-status-danger" : "border-border text-ink-secondary dark:border-white/15 dark:text-white/70"
          )}
        >
          <p className="flex-1">{a.mensagem}</p>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => fecharAviso(a.id)}
            className="shrink-0 rounded p-1 transition-colors hover:bg-surface-soft dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
