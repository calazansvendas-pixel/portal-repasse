"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ItemMenu {
  rotulo: string;
  icone: LucideIcon;
  onClick: () => void;
  perigo?: boolean;
}

/** Menu "três pontinhos" do card (edição/exclusão para o criador; God Mode completo para a Gerência). */
export function MenuTarefa({ itens }: { itens: ItemMenu[] }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div ref={raiz} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Opções da tarefa"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-primary dark:hover:bg-white/10 dark:hover:text-white"
      >
        <MoreVertical size={16} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="surface-card absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden py-1 shadow-md"
        >
          {itens.map(({ rotulo, icone: Icone, onClick, perigo }) => (
            <button
              key={rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                onClick();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium",
                perigo
                  ? "text-status-danger hover:bg-status-danger/10"
                  : "text-ink-primary hover:bg-surface-soft dark:text-white dark:hover:bg-white/10"
              )}
            >
              <Icone size={14} />
              {rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
