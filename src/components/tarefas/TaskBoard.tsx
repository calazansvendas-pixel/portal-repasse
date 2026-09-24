"use client";

import { useMemo } from "react";
import type { Assistente, QuadroEscalonamento, Tarefa } from "@/lib/types";
import { ASSISTENTE_LABEL, QUADRO_ESCALONAMENTO_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { TaskCard } from "./TaskCard";

interface Coluna {
  chave: string;
  titulo: string;
  tarefas: Tarefa[];
  escalonamento: boolean;
}

export function TaskBoard({
  pracas,
  tarefas,
  loading,
  somenteLeitura = false,
  quadrosEscalonamento = [],
}: {
  pracas: Assistente[];
  tarefas: Tarefa[];
  loading: boolean;
  somenteLeitura?: boolean;
  /** Colunas extras de escalonamento (Coordenador/Analista) — sempre somente-leitura. */
  quadrosEscalonamento?: QuadroEscalonamento[];
}) {
  const colunas = useMemo<Coluna[]>(() => {
    const regionais = pracas.map((praca) => ({
      chave: praca,
      titulo: ASSISTENTE_LABEL[praca],
      tarefas: ordenarPorSla(tarefas.filter((t) => t.praca === praca)),
      escalonamento: false,
    }));

    const escalonadas = quadrosEscalonamento.map((quadro) => ({
      chave: quadro,
      titulo: QUADRO_ESCALONAMENTO_LABEL[quadro],
      tarefas: ordenarPorSla(tarefas.filter((t) => t.escalonadoPara?.includes(quadro))),
      escalonamento: true,
    }));

    return [...regionais, ...escalonadas];
  }, [pracas, tarefas, quadrosEscalonamento]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Carregando tarefas…</p>;
  }

  return (
    <div
      className={
        colunas.length > 1
          ? "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]"
          : "max-w-xl"
      }
    >
      {colunas.map(({ chave, titulo, tarefas: tarefasDaColuna, escalonamento }) => (
        <div key={chave} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2
              className={cn(
                "text-sm font-bold uppercase tracking-wide",
                escalonamento ? "text-status-danger" : "text-ink-secondary dark:text-white/60"
              )}
            >
              {titulo}
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                escalonamento
                  ? "bg-status-danger/10 text-status-danger"
                  : "bg-surface-green text-brand-primaryDark dark:bg-white/10 dark:text-white/70"
              )}
            >
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
                <TaskCard key={t.id} tarefa={t} somenteLeitura={escalonamento || somenteLeitura} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ordenarPorSla(lista: Tarefa[]): Tarefa[] {
  return [...lista].sort((a, b) => ordemSla(a.slaStatus) - ordemSla(b.slaStatus));
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
