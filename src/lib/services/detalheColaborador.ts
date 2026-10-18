import type { Colaborador } from "@/app/api/colaboradores/route";
import type { TarefaDetalhe } from "@/lib/server/analytics";
import type { Quadro } from "@/lib/types";
import { quadroDoColaborador, resolverColaboradorId } from "./produtividadeColaboradores";

const SEM_PRODUTO = "Não informado";
const MAX_PASTAS_ATIVAS = 50;
const MS_DIA = 86_400_000;

export interface EtapaDetalhe {
  etapa: string;
  volume: number; // pastas distintas que passaram pela etapa sob a posse do colaborador
  diasMedios: number | null; // tempo médio de retenção na etapa; null = sem data para medir
}

export interface EmpreendimentoDetalhe {
  produto: string;
  total: number;
  pct: number;
}

export interface PastaAtiva {
  id: string;
  cliente: string;
  produto: string;
  etapa: string;
  diasNaEtapa: number;
}

export interface DetalheColaborador {
  colaboradorId: string;
  colaboradorNome: string;
  role: Colaborador["role"];
  dias: number;
  etapaMaisTrabalhada: EtapaDetalhe | null;
  etapaMaiorTempo: EtapaDetalhe | null;
  empreendimentoMaiorVolume: EmpreendimentoDetalhe | null;
  etapas: EtapaDetalhe[];
  empreendimentos: EmpreendimentoDetalhe[];
  totalPastasAtivas: number;
  pastasAtivas: PastaAtiva[]; // limitada a MAX_PASTAS_ATIVAS, as mais antigas na etapa primeiro
}

const ATIVAS = new Set(["pendente", "pending_validation", "audit_failed"]);

function dataParaMs(dia: string): number {
  return new Date(`${dia.slice(0, 10)}T00:00:00Z`).getTime();
}

function diasEntreDatas(inicio: string, fim: number): number {
  return Math.max(0, Math.round((fim - dataParaMs(inicio)) / MS_DIA));
}

/** Tarefas sob posse do colaborador — mesma resolução de indivíduo da tabela de Produtividade. */
export function tarefasDoColaborador(
  colaboradores: Colaborador[],
  tarefas: TarefaDetalhe[],
  colaboradorId: string
): { colaborador: Colaborador; tarefas: TarefaDetalhe[] } | null {
  const porQuadro = new Map<Quadro, string[]>();
  let alvo: Colaborador | null = null;
  for (const c of colaboradores) {
    const quadro = quadroDoColaborador(c);
    if (!quadro) continue;
    porQuadro.set(quadro, [...(porQuadro.get(quadro) ?? []), c.uid]);
    if (c.uid === colaboradorId) alvo = c;
  }
  if (!alvo) return null;
  return { colaborador: alvo, tarefas: tarefas.filter((t) => resolverColaboradorId(t, porQuadro) === colaboradorId) };
}

/** Números das pastas tocadas pelas tarefas — para buscar o empreendimento de cada uma. */
export function numerosDasTarefas(tarefas: TarefaDetalhe[]): string[] {
  const numeros = new Set<string>();
  for (const t of tarefas) {
    if (t.numero) numeros.add(t.numero);
    for (const n of t.numerosRelacionados ?? []) numeros.add(n);
  }
  return [...numeros];
}

function mediaUmaCasa(valores: number[]): number | null {
  return valores.length ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10 : null;
}

/**
 * Relatório individual a partir do trajeto (`historicoEtapas`) e das tarefas do colaborador.
 * Uma passagem por etapa = um item do histórico; o tempo de retenção vai da entrada na etapa até
 * a próxima mudança (ou até hoje/resolução, na etapa em que a pasta está). Só passagens iniciadas
 * dentro da janela entram. Tarefas agregadas não têm trajeto próprio: contam o volume na etapa
 * atual, sem tempo de retenção.
 */
export function calcularDetalheColaborador(
  colaborador: Colaborador,
  tarefas: TarefaDetalhe[],
  produtoPorNumero: Map<string, string>,
  dias: number,
  agora = Date.now()
): DetalheColaborador {
  const corteDia = new Date(agora - dias * MS_DIA).toISOString().slice(0, 10);

  const pastasPorEtapa = new Map<string, Set<string>>();
  const temposPorEtapa = new Map<string, number[]>();
  const pastasPorProduto = new Map<string, Set<string>>();
  const pastasAtivas: PastaAtiva[] = [];

  const produtoDe = (numero: string | null | undefined) => (numero && produtoPorNumero.get(numero)) || SEM_PRODUTO;
  const registrarPasta = (etapa: string, produto: string, pasta: string) => {
    if (!pastasPorEtapa.has(etapa)) pastasPorEtapa.set(etapa, new Set());
    pastasPorEtapa.get(etapa)!.add(pasta);
    if (!pastasPorProduto.has(produto)) pastasPorProduto.set(produto, new Set());
    pastasPorProduto.get(produto)!.add(pasta);
  };

  for (const t of tarefas) {
    const ativa = ATIVAS.has(t.status);
    const fimTarefa = ativa ? agora : new Date(t.resolvidoEm ?? t.atualizadoEm).getTime();
    const etapaAtual = t.etapa?.trim() || "—";
    let diasNaEtapa = 0;

    if (t.numero) {
      const produto = produtoDe(t.numero);
      const trajeto = [...(t.historicoEtapas ?? [])].sort((a, b) => a.data.localeCompare(b.data));
      const passagens = trajeto.length ? trajeto : [{ etapa: etapaAtual, data: t.criadoEm.slice(0, 10) }];
      passagens.forEach((p, i) => {
        const etapa = p.etapa?.trim() || "—";
        const fim = i + 1 < passagens.length ? dataParaMs(passagens[i + 1].data) : fimTarefa;
        const retencao = Number.isNaN(fim) ? null : diasEntreDatas(p.data, fim);
        if (i + 1 === passagens.length && retencao !== null) diasNaEtapa = retencao;
        if (p.data < corteDia) return;
        registrarPasta(etapa, produto, t.numero!);
        if (retencao !== null) temposPorEtapa.set(etapa, [...(temposPorEtapa.get(etapa) ?? []), retencao]);
      });
      if (ativa) {
        pastasAtivas.push({
          id: t.numero,
          cliente: t.clienteNome?.trim() || `Pasta ${t.numero}`,
          produto,
          etapa: etapaAtual,
          diasNaEtapa,
        });
      }
    } else {
      const numeros = t.numerosRelacionados ?? [];
      for (const n of numeros) registrarPasta(etapaAtual, produtoDe(n), n);
      if (ativa) {
        const produtos = [...new Set(numeros.map(produtoDe))];
        pastasAtivas.push({
          id: `${t.criadoEm}::${etapaAtual}::${numeros.join(",")}`,
          cliente: numeros.length ? `Tarefa agregada (${numeros.length} pastas)` : "Tarefa avulsa",
          produto: produtos.length === 1 ? produtos[0] : produtos.length > 1 ? "Vários" : SEM_PRODUTO,
          etapa: etapaAtual,
          diasNaEtapa: diasEntreDatas(t.criadoEm, agora),
        });
      }
    }
  }

  const etapas: EtapaDetalhe[] = [...pastasPorEtapa.entries()]
    .map(([etapa, pastas]) => ({ etapa, volume: pastas.size, diasMedios: mediaUmaCasa(temposPorEtapa.get(etapa) ?? []) }))
    .sort((a, b) => b.volume - a.volume || a.etapa.localeCompare(b.etapa, "pt-BR", { numeric: true }));

  const totalProdutos = [...pastasPorProduto.values()].reduce((s, p) => s + p.size, 0);
  const empreendimentos: EmpreendimentoDetalhe[] = [...pastasPorProduto.entries()]
    .map(([produto, pastas]) => ({
      produto,
      total: pastas.size,
      pct: totalProdutos ? Math.round((pastas.size / totalProdutos) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const comTempo = etapas.filter((e) => e.diasMedios !== null);
  const etapaMaiorTempo = comTempo.length
    ? comTempo.reduce((m, e) => (e.diasMedios! > m.diasMedios! ? e : m))
    : null;

  pastasAtivas.sort((a, b) => b.diasNaEtapa - a.diasNaEtapa);

  return {
    colaboradorId: colaborador.uid,
    colaboradorNome: colaborador.nome,
    role: colaborador.role,
    dias,
    etapaMaisTrabalhada: etapas[0] ?? null,
    etapaMaiorTempo,
    empreendimentoMaiorVolume: empreendimentos[0] ?? null,
    etapas,
    empreendimentos,
    totalPastasAtivas: pastasAtivas.length,
    pastasAtivas: pastasAtivas.slice(0, MAX_PASTAS_ATIVAS),
  };
}
