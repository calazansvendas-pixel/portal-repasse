import type { Colaborador } from "@/app/api/colaboradores/route";
import type { TarefaAnalitica } from "@/lib/server/analytics";
import type { Quadro } from "@/lib/types";

const MAX_ETAPAS_POR_COLABORADOR = 5;

export interface EtapaContagem {
  etapa: string;
  total: number;
}

export interface ProdutividadeColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  role: Colaborador["role"]; // "assistente" | "coordenador" | "analista" (Gerência nunca aparece aqui)
  quadro: Quadro;
  ativas: number; // backlog atual (status pendente/pending_validation/audit_failed), sem filtro de data
  concluidasNoPeriodo: number; // validated_done entre as tarefas criadas na janela selecionada
  porEtapa: EtapaContagem[]; // principais etapas das tarefas concluídas no período
  tempoMedioConclusaoDias: number | null; // null = nenhuma concluída no período
  taxaDentroDoPrazoPct: number | null; // null = nenhuma concluída no período tinha dataLimite definida
}

/** Mesmo critério de quadroDoColaborador em ModaisTarefa.tsx/MapeamentoEmpreendimentos.tsx:
 * Gerência não tem quadro/coluna própria, então nunca entra na Produtividade por Colaborador. */
export function quadroDoColaborador(c: Colaborador): Quadro | null {
  if (c.role === "assistente") return c.praca ?? null;
  if (c.role === "coordenador") return "coordenador";
  if (c.role === "analista") return "analista";
  return null;
}

/**
 * Resolve o colaborador individual responsável por uma tarefa, na mesma ordem de prioridade do
 * roteamento em reconciliarTarefa (auditEngine.ts): override manual da Gerência > Mapeamento de
 * Empreendimentos/destino fixo da regra > quadro. Pelo quadro só dá para apontar UM indivíduo
 * quando existe exatamente um colaborador cadastrado naquele quadro — com dois Coordenadores,
 * por exemplo, a tarefa fica sem indivíduo resolvido (nunca adivinha qual dos dois tratou, nem
 * conta para os dois ao mesmo tempo, o que infla artificialmente o total do time).
 */
export function resolverColaboradorId(
  t: Pick<TarefaAnalitica, "praca" | "responsavelId" | "responsavelCustomizadoId">,
  porQuadro: Map<Quadro, string[]>
): string | null {
  if (t.responsavelCustomizadoId) return t.responsavelCustomizadoId;
  if (t.responsavelId) return t.responsavelId;
  const doQuadro = porQuadro.get(t.praca);
  return doQuadro && doQuadro.length === 1 ? doQuadro[0] : null;
}

function diasEntre(inicioISO: string | null | undefined, fimISO: string | null | undefined): number | null {
  if (!inicioISO || !fimISO) return null;
  const inicio = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.max(0, (fim - inicio) / 86_400_000);
}

/**
 * Carga e desempenho por colaborador individual: cruza a lista de colaboradores ativos com o
 * backlog atual (`tarefasAtivas`, sem filtro de data) e as tarefas criadas na janela selecionada
 * (`tarefasJanela`) — ver lerTarefasAtivas/lerTarefasDaJanela em analytics.ts. "Concluídas no
 * período"/"tempo médio"/"dentro do prazo" usam a MESMA janela e convenção de
 * calcularRankingParceiros (tarefas CRIADAS no período que chegaram a validated_done), para os
 * números baterem entre as duas seções do Analytics.
 */
export function calcularProdutividadeColaboradores(
  colaboradores: Colaborador[],
  tarefasAtivas: TarefaAnalitica[],
  tarefasJanela: TarefaAnalitica[]
): ProdutividadeColaborador[] {
  const elegiveis = colaboradores
    .map((colaborador) => ({ colaborador, quadro: quadroDoColaborador(colaborador) }))
    .filter((c): c is { colaborador: Colaborador; quadro: Quadro } => c.quadro !== null);

  const porQuadro = new Map<Quadro, string[]>();
  for (const { colaborador, quadro } of elegiveis) {
    porQuadro.set(quadro, [...(porQuadro.get(quadro) ?? []), colaborador.uid]);
  }

  const ativasPorColaborador = new Map<string, number>();
  for (const t of tarefasAtivas) {
    const id = resolverColaboradorId(t, porQuadro);
    if (id) ativasPorColaborador.set(id, (ativasPorColaborador.get(id) ?? 0) + 1);
  }

  const concluidasPorColaborador = new Map<string, TarefaAnalitica[]>();
  for (const t of tarefasJanela) {
    if (t.status !== "validated_done") continue;
    const id = resolverColaboradorId(t, porQuadro);
    if (!id) continue;
    concluidasPorColaborador.set(id, [...(concluidasPorColaborador.get(id) ?? []), t]);
  }

  return elegiveis
    .map(({ colaborador, quadro }) => {
      const concluidas = concluidasPorColaborador.get(colaborador.uid) ?? [];

      const etapas = new Map<string, number>();
      for (const t of concluidas) {
        const etapa = t.etapa?.trim();
        if (!etapa) continue;
        etapas.set(etapa, (etapas.get(etapa) ?? 0) + 1);
      }
      const porEtapa = [...etapas.entries()]
        .map(([etapa, total]) => ({ etapa, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, MAX_ETAPAS_POR_COLABORADOR);

      const tempos = concluidas
        .map((t) => diasEntre(t.criadoEm, t.resolvidoEm ?? t.atualizadoEm))
        .filter((d): d is number => d !== null);
      const tempoMedioConclusaoDias = tempos.length
        ? Math.round((tempos.reduce((s, v) => s + v, 0) / tempos.length) * 10) / 10
        : null;

      const comPrazo = concluidas.filter((t) => !!t.dataLimite);
      const dentroDoPrazo = comPrazo.filter((t) => {
        const resolucao = (t.resolvidoEm ?? t.atualizadoEm)?.slice(0, 10);
        return !!resolucao && !!t.dataLimite && resolucao <= t.dataLimite;
      });
      const taxaDentroDoPrazoPct = comPrazo.length
        ? Math.round((dentroDoPrazo.length / comPrazo.length) * 1000) / 10
        : null;

      return {
        colaboradorId: colaborador.uid,
        colaboradorNome: colaborador.nome,
        role: colaborador.role,
        quadro,
        ativas: ativasPorColaborador.get(colaborador.uid) ?? 0,
        concluidasNoPeriodo: concluidas.length,
        porEtapa,
        tempoMedioConclusaoDias,
        taxaDentroDoPrazoPct,
      };
    })
    .sort((a, b) => b.ativas - a.ativas);
}
