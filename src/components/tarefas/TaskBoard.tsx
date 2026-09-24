"use client";

import { useMemo } from "react";
import type { Assistente, Tarefa } from "@/lib/types";
import { ASSISTENTE_LABEL } from "@/lib/types";
import { TaskCard } from "./TaskCard";

export function TaskBoard({
  pracas,
  tarefas,
  loading,
  somenteLeitura = false,
}: {
  pracas: Assistente[];
  tarefas: Tarefa[];
  loading: boolean;
  somenteLeitura?: boolean;
}) {
  const colunas = useMemo(() => {
    return pracas.map((praca) => ({
      praca,
      tarefas: tarefas
        .filter((t) => t.praca === praca)
        .sort((a, b) => (a.slaStatus === b.slaStatus ? 0 : ordemSla(a.slaStatus) - ordemSla(b.slaStatus))),
    }));
  }, [pracas, tarefas]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Carregando tarefas…</p>;
  }

  return (
    <div className={colunas.length > 1 ? "grid grid-cols-1 gap-5 md:grid-cols-3" : "max-w-xl"}>
      {colunas.map(({ praca, tarefas: tarefasDaColuna }) => (
        <div key={praca} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-secondary dark:text-white/60">
              {ASSISTENTE_LABEL[praca]}
            </h2>
            <span className="rounded-full bg-surface-green px-2 py-0.5 text-xs font-semibold text-brand-primaryDark dark:bg-white/10 dark:text-white/70">
              {tarefasDaColuna.length}
            </span>
          </div>

          {tarefasDaColuna.length === 0 ? (
            <div className="surface-card p-4 text-center text-xs text-ink-muted">
              Nenhuma pendência no momento.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {tarefasDaColuna.map((t) => (
                <TaskCard key={t.id} tarefa={t} somenteLeitura={somenteLeitura} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ordemSla(status: Tarefa["slaStatus"]): number {
  const ordem: Record<Tarefa["slaStatus"], number> = {
    estourado: 0,
    urgente: 1,
    atencao: 2,
    no_prazo: 3,
  };
  return ordem[status];
}
