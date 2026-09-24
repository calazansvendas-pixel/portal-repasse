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
  const { colunasTop, colunaCoordenador } = useMemo(() => {
    const regionais: Coluna[] = pracas.map((praca) => ({
      chave: praca as Quadro,
      titulo: ASSISTENTE_LABEL[praca],
      tarefas: ordenarPorSla(tarefas.filter((t) => t.praca === praca)),
      escalonamento: false,
    }));

    const escalonadas: Coluna[] = quadrosEscalonamento.map((quadro) => ({
      chave: quadro as Quadro,
      titulo: QUADRO_LABEL[quadro],
      tarefas: ordenarPorSla(
        tarefas.filter((t) => t.praca === quadro || t.escalonadoPara?.includes(quadro))
      ),
      escalonamento: true,
    }));

    // Andressa (Analista) sobe para a linha de cima, ao lado das 3 praças —
    // trabalho dela é interno/operação. Paulo (Coordenador) fica isolado
    // embaixo, à parte — o trabalho dele é externo/relacionamento com a
    // imobiliária, não faz sentido competir por espaço com as praças.
    const analista = escalonadas.find((c) => c.chave === "analista");
    const coordenador = escalonadas.find((c) => c.chave === "coordenador");

    return {
      colunasTop: analista ? [...regionais, analista] : regionais,
      colunaCoordenador: coordenador ?? null,
    };
  }, [pracas, tarefas, quadrosEscalonamento]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Carregando tarefas…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        className={
          colunasTop.length > 1
            ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
            : "max-w-xl"
        }
      >
        {colunasTop.map((coluna) => (
          <ColunaTarefas key={coluna.chave} coluna={coluna} interativo={meusQuadros.includes(coluna.chave)} />
        ))}
      </div>

      {colunaCoordenador && (
        <div className="max-w-xl">
          <ColunaTarefas coluna={colunaCoordenador} interativo={meusQuadros.includes(colunaCoordenador.chave)} />
        </div>
      )}
    </div>
  );
}

function ColunaTarefas({ coluna, interativo }: { coluna: Coluna; interativo: boolean }) {
  const { titulo, tarefas: tarefasDaColuna, escalonamento } = coluna;
  return (
    <div className="flex flex-col gap-3">
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
