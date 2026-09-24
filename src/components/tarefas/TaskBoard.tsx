"use client";

import { useMemo } from "react";
import type { Assistente, Quadro, QuadroEscalonamento, Tarefa } from "@/lib/types";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { TaskCard } from "./TaskCard";

interface Coluna {
  chave: Quadro;
  titulo: string;
  tarefas: Tarefa[];
  escalonamento: boolean;
}

export function TaskBoard({
  pracas,
  tarefas,
  loading,
  meusQuadros = [],
  quadrosEscalonamento = [],
}: {
  pracas: Assistente[];
  tarefas: Tarefa[];
  loading: boolean;
  /** Quadros em que o usuário atual pode marcar/desmarcar o checkbox. */
  meusQuadros?: Quadro[];
  /** Colunas extras de Coordenador/Analista: tarefas nativas + escalonadas. */
  quadrosEscalonamento?: QuadroEscalonamento[];
}) {
  const colunas = useMemo<Coluna[]>(() => {
    const regionais = pracas.map((praca) => ({
      chave: praca as Quadro,
      titulo: ASSISTENTE_LABEL[praca],
      tarefas: ordenarPorSla(tarefas.filter((t) => t.praca === praca)),
      escalonamento: false,
    }));

    const escalonadas = quadrosEscalonamento.map((quadro) => ({
      chave: quadro as Quadro,
      titulo: QUADRO_LABEL[quadro],
      tarefas: ordenarPorSla(
        tarefas.filter((t) => t.praca === quadro || t.escalonadoPara?.includes(quadro))
      ),
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
      {colunas.map(({ chave, titulo, tarefas: tarefasDaColuna, escalonamento }) => {
        const interativo = meusQuadros.includes(chave);
        return (
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
                  <TaskCard key={t.id} tarefa={t} somenteLeitura={!interativo} />
                ))}
              </div>
            )}
          </div>
        );
      })}
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
