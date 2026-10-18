import type { Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { calcularEvolucaoEtapas, type EvolucaoEtapas, type SnapshotEtapa } from "@/lib/services/analiseEtapas";
import { calcularMetricasEstrategicas, type MetricasEstrategicas } from "@/lib/services/analiseEstrategica";
import type { Registro, Tarefa } from "@/lib/types";
import type { Colaborador } from "@/app/api/colaboradores/route";

// Mesmo critério de ATIVAS em auditEngine.ts: "audit_failed" entra como ativa para a tarefa
// continuar pesando no backlog de quem é responsável por ela até ser reconciliada de novo.
const TAREFAS_ATIVAS: Tarefa["status"][] = ["pendente", "pending_validation", "audit_failed"];

export const DIAS_PADRAO = 21;
export const DIAS_MAXIMO = 90; // teto da janela de análise (cada dia lê milhares de snapshots)
export const LIMITE_SNAPSHOTS = 8000; // proteção contra datasets muito grandes
export const LIMITE_TAREFAS = 5000;

/** Teto obrigatório: valor ausente, inválido ou absurdo nunca vira uma consulta sem limite. */
export function lerDias(req: NextRequest): number {
  const pedido = Math.floor(Number(req.nextUrl.searchParams.get("dias") ?? DIAS_PADRAO));
  return Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), DIAS_MAXIMO) : DIAS_PADRAO;
}

export interface AnaliseSnapshots {
  evolucao: EvolucaoEtapas;
  estrategicas: MetricasEstrategicas;
  /** Alguma consulta de snapshots bateu no teto: os números são parciais. */
  truncado: boolean;
}

/**
 * Lê UMA vez os snapshots das últimas `dias` importações e deriva, em memória:
 *  - a evolução de permanência por etapa;
 *  - os indicadores estratégicos, sobre as pastas da importação mais recente (foto atual da esteira).
 * Os indicadores estratégicos reaproveitam esta leitura: não custam nenhuma leitura extra.
 */
export async function lerAnaliseSnapshots(db: Firestore, dias: number): Promise<AnaliseSnapshots> {
  const importacoesSnap = await db.collection("importacoes").orderBy("id", "desc").limit(dias).get();
  const importacaoIds = importacoesSnap.docs.map((d) => d.id);
  if (importacaoIds.length === 0) {
    return { evolucao: calcularEvolucaoEtapas([]), estrategicas: calcularMetricasEstrategicas([]), truncado: false };
  }
  const maisRecente = importacaoIds[0]; // ordenado por id (yyyy-MM-dd) decrescente

  const entradas: SnapshotEtapa[] = [];
  let truncado = false;
  const pastasAtuais: Pick<Registro, "etapa" | "observacao">[] = [];
  for (let i = 0; i < importacaoIds.length; i += 10) {
    const snap = await db
      .collectionGroup("snapshots")
      .where("importacaoId", "in", importacaoIds.slice(i, i + 10))
      .select("numero", "importacaoId", "etapa", "observacao")
      .limit(LIMITE_SNAPSHOTS)
      .get();
    if (snap.size >= LIMITE_SNAPSHOTS) truncado = true;
    snap.forEach((doc) => {
      const data = doc.data();
      entradas.push({ numero: data.numero, importacaoId: data.importacaoId, etapa: data.etapa });
      if (data.importacaoId === maisRecente) {
        pastasAtuais.push({ etapa: String(data.etapa ?? ""), observacao: String(data.observacao ?? "") });
      }
    });
  }
  return {
    evolucao: calcularEvolucaoEtapas(entradas),
    estrategicas: calcularMetricasEstrategicas(pastasAtuais as Registro[]),
    truncado,
  };
}

/** Evolução de permanência por etapa (rota legada /api/analytics/etapas). */
export async function lerEvolucaoEtapas(db: Firestore, dias: number): Promise<EvolucaoEtapas> {
  return (await lerAnaliseSnapshots(db, dias)).evolucao;
}

// Campos usados pelo ranking/mapa de imobiliárias (ver analiseParceiros.ts) + pela Produtividade
// por Colaborador (ver produtividadeColaboradores.ts): "praca"/"responsavelId"/
// "responsavelCustomizadoId" resolvem o indivíduo responsável, "etapa"/"dataLimite" alimentam a
// distribuição por etapa e a taxa de conclusão dentro do prazo.
const CAMPOS_TAREFA_ANALITICA = [
  "imobiliaria",
  "tipoPendencia",
  "status",
  "criadoEm",
  "resolvidoEm",
  "atualizadoEm",
  "falhaAuditoriaEm",
  "praca",
  "responsavelId",
  "responsavelCustomizadoId",
  "etapa",
  "dataLimite",
] as const;

export type TarefaAnalitica = Pick<Tarefa, (typeof CAMPOS_TAREFA_ANALITICA)[number]>;

/**
 * Tarefas criadas na janela (uma única consulta), lendo só os campos que as métricas usam.
 * Inclui as validadas: o ranking e a Produtividade por Colaborador precisam delas para contar
 * resolvidas e tempo de resolução.
 */
export async function lerTarefasDaJanela(db: Firestore, dias: number): Promise<TarefaAnalitica[]> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
  const snap = await db
    .collection("tarefas")
    .where("criadoEm", ">=", corte)
    .select(...CAMPOS_TAREFA_ANALITICA)
    .limit(LIMITE_TAREFAS)
    .get();
  return snap.docs.map((d) => d.data() as TarefaAnalitica);
}

/**
 * TODAS as tarefas ativas do sistema agora, sem filtro de data — usado só pelo backlog ("Ativas")
 * da Produtividade por Colaborador: uma tarefa aberta há 40 dias ainda pesa na carga de hoje,
 * mesmo numa janela de 21 dias (ver calcularProdutividadeColaboradores).
 */
export async function lerTarefasAtivas(db: Firestore): Promise<TarefaAnalitica[]> {
  const snap = await db
    .collection("tarefas")
    .where("status", "in", TAREFAS_ATIVAS)
    .select(...CAMPOS_TAREFA_ANALITICA)
    .limit(LIMITE_TAREFAS)
    .get();
  return snap.docs.map((d) => d.data() as TarefaAnalitica);
}

// Campos extras para o relatório individual por colaborador (ver detalheColaborador.ts): trajeto
// de etapas e identificação da pasta/cliente. Lidos só sob demanda por /api/analytics/colaborador,
// fora de CAMPOS_TAREFA_ANALITICA para não engordar o painel principal.
const CAMPOS_TAREFA_DETALHE = [
  ...CAMPOS_TAREFA_ANALITICA,
  "numero",
  "numerosRelacionados",
  "clienteNome",
  "nomesRelacionados",
  "historicoEtapas",
] as const;

export type TarefaDetalhe = Pick<Tarefa, (typeof CAMPOS_TAREFA_DETALHE)[number]>;

/** Tarefas da janela + backlog ativo (sem duplicar), com os campos do relatório individual. */
export async function lerTarefasParaDetalhe(db: Firestore, dias: number): Promise<TarefaDetalhe[]> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
  const [janela, ativas] = await Promise.all([
    db.collection("tarefas").where("criadoEm", ">=", corte).select(...CAMPOS_TAREFA_DETALHE).limit(LIMITE_TAREFAS).get(),
    db.collection("tarefas").where("status", "in", TAREFAS_ATIVAS).select(...CAMPOS_TAREFA_DETALHE).limit(LIMITE_TAREFAS).get(),
  ]);
  const porId = new Map<string, TarefaDetalhe>();
  for (const d of [...janela.docs, ...ativas.docs]) porId.set(d.id, d.data() as TarefaDetalhe);
  return [...porId.values()];
}

/** Empreendimento (`produto`) de cada pasta, em lote — a tarefa não guarda o produto, só o registro. */
export async function lerProdutosPorNumero(db: Firestore, numeros: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < numeros.length; i += 300) {
    const refs = numeros.slice(i, i + 300).map((n) => db.collection("registros").doc(n));
    const docs = await db.getAll(...refs, { fieldMask: ["produto"] });
    for (const doc of docs) {
      const produto = String(doc.data()?.produto ?? "").trim();
      if (produto) mapa.set(doc.id, produto);
    }
  }
  return mapa;
}

/** Colaboradores ativos (coleção `users`) — mesma leitura de /api/colaboradores/route.ts,
 * compartilhada aqui para a Produtividade por Colaborador não duplicar a consulta/mapeamento. */
export async function lerColaboradoresAtivos(db: Firestore): Promise<Colaborador[]> {
  const snap = await db.collection("users").where("ativo", "==", true).get();
  return snap.docs.map((d) => {
    const data = d.data() as Pick<Colaborador, "nome" | "role" | "praca">;
    return { uid: d.id, nome: data.nome ?? d.id, role: data.role ?? "assistente", praca: data.praca };
  });
}
