"use client";

import { useMemo } from "react";
import { QUADRO_LABEL } from "@/lib/types";
import type { Quadro, Tarefa } from "@/lib/types";

const ORDEM_QUADRO: Quadro[] = ["layza", "eliane", "catharina", "coordenador", "analista"];

/**
 * Resumo leve "quantas pastas cada colaborador trabalhou no período" — nenhuma consulta nova ao
 * Firestore: conta em memória sobre `tarefas`, que já chega aqui filtrada por período (e pelos
 * demais filtros) via aplicarFiltros em FiltrosTarefas.tsx. Só aparece quando um período está
 * selecionado; fora disso, "trabalhadas no período" não tem sentido (viraria só a contagem de
 * backlog atual, que já aparece nas colunas do quadro).
 */
export function ResumoPeriodoColaboradores({ tarefas }: { tarefas: Tarefa[] }) {
  const porQuadro = useMemo(() => {
    const contagem = new Map<Quadro, number>();
    for (const t of tarefas) {
      contagem.set(t.praca, (contagem.get(t.praca) ?? 0) + 1);
    }
    return ORDEM_QUADRO.map((quadro) => ({ quadro, total: contagem.get(quadro) ?? 0 })).filter((c) => c.total > 0);
  }, [tarefas]);

  if (porQuadro.length === 0) {
    return (
      <div className="surface-card -mt-2 mb-4 p-3 text-sm text-ink-muted sm:mb-6">
        Nenhuma pasta com atividade registrada no período selecionado.
      </div>
    );
  }

  return (
    <div className="surface-card -mt-2 mb-4 flex flex-wrap items-center gap-2 p-3 sm:mb-6">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Trabalhadas no período</span>
      {porQuadro.map(({ quadro, total }) => (
        <span
          key={quadro}
          className="rounded-full bg-surface-green px-2.5 py-1 text-xs font-medium text-brand-primaryDark dark:bg-white/10 dark:text-white/80"
        >
          {QUADRO_LABEL[quadro]} · {total}
        </span>
      ))}
    </div>
  );
}
