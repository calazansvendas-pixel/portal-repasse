"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

/** Menu "três pontinhos" das tarefas avulsas: Editar / Excluir. */
export function MenuTarefaAvulsa({ onEditar, onExcluir }: { onEditar: () => void; onExcluir: () => void }) {
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

  function escolher(acao: () => void) {
    setAberto(false);
    acao();
  }

  return (
    <div ref={raiz} className="relative shrink-0">
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
          className="surface-card absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden py-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => escolher(onEditar)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink-primary hover:bg-surface-soft dark:text-white dark:hover:bg-white/10"
          >
            <Pencil size={14} />
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => escolher(onExcluir)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-status-danger hover:bg-status-danger/10"
          >
            <Trash2 size={14} />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}
