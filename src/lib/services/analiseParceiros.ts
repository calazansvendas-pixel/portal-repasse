import type { Tarefa } from "@/lib/types";

export interface RankingParceiro {
  imobiliaria: string;
  totalPendencias: number;
  resolvidas: number;
  falhasAuditoria: number;
  taxaFalhaPct: number; // 0-100
  tempoMedioResolucaoDias: number | null;
}

export interface CruzamentoPendencia {
  imobiliaria: string;
  tipoPendencia: string;
  total: number;
}

/** Ranking de desempenho por imobiliária, a partir das tarefas geradas pela esteira. */
export function calcularRankingParceiros(tarefas: Tarefa[]): RankingParceiro[] {
  const porImobiliaria = new Map<string, Tarefa[]>();
  for (const t of tarefas) {
    const chave = t.imobiliaria?.trim() || "Não informado";
    porImobiliaria.set(chave, [...(porImobiliaria.get(chave) ?? []), t]);
  }

  const ranking: RankingParceiro[] = [];
  for (const [imobiliaria, lista] of porImobiliaria) {
    const resolvidas = lista.filter((t) => t.status === "validated_done");
    const falhas = lista.filter((t) => t.status === "audit_failed" || t.falhaAuditoriaEm);

    const temposResolucao = resolvidas
      .map((t) => diasEntre(t.criadoEm, t.resolvidoEm ?? t.atualizadoEm))
      .filter((d): d is number => d !== null);

    ranking.push({
      imobiliaria,
      totalPendencias: lista.length,
      resolvidas: resolvidas.length,
      falhasAuditoria: falhas.length,
      taxaFalhaPct: lista.length ? Math.round((falhas.length / lista.length) * 1000) / 10 : 0,
      tempoMedioResolucaoDias: temposResolucao.length
        ? Math.round((temposResolucao.reduce((s, v) => s + v, 0) / temposResolucao.length) * 10) / 10
        : null,
    });
  }

  return ranking.sort((a, b) => b.totalPendencias - a.totalPendencias);
}

/** Cruzamento Imobiliária x Tipo de pendência (para o "Mapa de Treinamento"). */
export function calcularMapaTreinamento(tarefas: Tarefa[], topImobiliarias = 8): CruzamentoPendencia[] {
  const totalPorImobiliaria = new Map<string, number>();
  for (const t of tarefas) {
    const chave = t.imobiliaria?.trim() || "Não informado";
    totalPorImobiliaria.set(chave, (totalPorImobiliaria.get(chave) ?? 0) + 1);
  }
  const imobiliariasRelevantes = new Set(
    [...totalPorImobiliaria.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topImobiliarias)
      .map(([nome]) => nome)
  );

  const contagem = new Map<string, number>();
  for (const t of tarefas) {
    const imobiliaria = t.imobiliaria?.trim() || "Não informado";
    if (!imobiliariasRelevantes.has(imobiliaria)) continue;
    const chave = `${imobiliaria}::${t.tipoPendencia}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }

  return [...contagem.entries()].map(([chave, total]) => {
    const [imobiliaria, tipoPendencia] = chave.split("::");
    return { imobiliaria, tipoPendencia, total };
  });
}

function diasEntre(inicioISO: string | null | undefined, fimISO: string | null | undefined): number | null {
  if (!inicioISO || !fimISO) return null;
  const inicio = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.max(0, (fim - inicio) / 86_400_000);
}
