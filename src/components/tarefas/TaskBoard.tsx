"use client";

import { useMemo } from "react";
import type { Assistente, Quadro, QuadroEscalonamento, Role, Tarefa } from "@/lib/types";
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
  role,
  pracas,
  tarefas,
  loading,
  meusQuadros = [],
  quadrosEscalonamento = [],
}: {
  role: Role;
  pracas: Assistente[];
  tarefas: Tarefa[];
  loading: boolean;
  /** Quadros em que o usuário atual pode marcar/desmarcar o checkbox. */
  meusQuadros?: Quadro[];
  /** Quadros de Coordenador/Analista visíveis (tarefas nativas + escalonadas). */
  quadrosEscalonamento?: QuadroEscalonamento[];
}) {
  // Ordem hierárquica de cima para baixo:
  //  1) quadro do próprio usuário (Coordenador ou Analista; a Gerência não tem
  //     quadro próprio, então o do Coordenador ocupa o topo para ela);
  //  2) quadro da Analista, se não for a própria logada (evita duplicar);
  //  3) grid das assistentes.
  const { topo, meio, assistentes } = useMemo(() => {
    const assistentes: Coluna[] = pracas.map((praca) => ({
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

    const analista = escalonadas.find((c) => c.chave === "analista") ?? null;
    const coordenador = escalonadas.find((c) => c.chave === "coordenador") ?? null;

    return {
      topo: role === "analista" ? analista : coordenador,
      meio: role === "analista" ? null : analista,
      assistentes,
    };
  }, [role, pracas, tarefas, quadrosEscalonamento]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Carregando tarefas…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {topo && <ColunaTarefas coluna={topo} interativo={meusQuadros.includes(topo.chave)} faixa />}
      {meio && <ColunaTarefas coluna={meio} interativo={meusQuadros.includes(meio.chave)} faixa />}

      {assistentes.length > 0 && (
        <div
          className={
            assistentes.length > 1
              ? "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
              : "max-w-xl"
          }
        >
          {assistentes.map((coluna) => (
            <ColunaTarefas key={coluna.chave} coluna={coluna} interativo={meusQuadros.includes(coluna.chave)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ColunaTarefas({ coluna, interativo, faixa = false }: { coluna: Coluna; interativo: boolean; faixa?: boolean }) {
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
        <div className={faixa ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3"}>
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
