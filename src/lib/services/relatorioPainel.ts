import { codigoEtapa } from "@/lib/auth/roles";
import { dataNoIntervalo } from "@/components/tarefas/FiltrosTarefas";
import { QUADRO_LABEL } from "@/lib/types";
import type { ClienteEnvolvido, NotaResolucao, Tarefa } from "@/lib/types";

export interface ContatoRelatorio {
  dataHora: string; // ISO datetime (NotaResolucao.data)
  colaborador: string;
  clienteNome: string;
  cpfCnpj: string | null;
  resumoAcao: string;
}

export interface GrupoImobiliariaRelatorio {
  imobiliaria: string;
  contatos: ContatoRelatorio[];
}

export interface GrupoEtapaRelatorio {
  etapa: string; // rótulo completo, ex. "0.01 - Inclusão da pasta"
  imobiliarias: GrupoImobiliariaRelatorio[];
  totalContatos: number;
}

export interface TotalPorChave {
  chave: string;
  total: number;
}

export interface SumarioRelatorioPainel {
  periodoInicio: string | null; // null = sem piso
  periodoFim: string | null; // null = sem teto
  filtrosAplicados: string[]; // já formatados pra exibição (ver montarResumoFiltros no chamador)
  colaboradorFiltro: string | null; // null = "Todos" — nenhuma pessoa específica selecionada
  totalContatos: number;
  porColaborador: TotalPorChave[];
  porEtapa: TotalPorChave[];
  porImobiliaria: TotalPorChave[];
}

export interface RelatorioPainel {
  sumario: SumarioRelatorioPainel;
  grupos: GrupoEtapaRelatorio[];
}

/** Uma tarefa "linha" tem UM cliente (ela mesma); uma agregada (gargalo) tem vários, cada um com a
 * própria etapa/imobiliária/histórico de notas (ver ClienteEnvolvido em types/index.ts) — tratar
 * os dois casos juntos aqui evita sub-contar contatos de tarefas de gargalo, que são comuns. */
interface FontePasta {
  etapa: string;
  imobiliaria: string;
  clienteNome: string;
  cpfCnpj: string | null;
  notas: NotaResolucao[];
}

function fontePastaDeClienteEnvolvido(c: ClienteEnvolvido): FontePasta {
  return {
    etapa: c.etapa,
    imobiliaria: c.imobiliaria,
    clienteNome: c.clienteNome,
    cpfCnpj: c.cpfCnpj ?? null,
    notas: c.historicoNotas ?? [],
  };
}

function fontesPastaDaTarefa(t: Tarefa): FontePasta[] {
  if (t.origem === "agregado" && t.clientesEnvolvidos?.length) {
    return t.clientesEnvolvidos.map(fontePastaDeClienteEnvolvido);
  }
  return [
    {
      etapa: t.etapa,
      imobiliaria: t.imobiliaria,
      clienteNome: t.clienteNome || `Pasta ${t.numero ?? "sem número"}`,
      cpfCnpj: t.cpfCnpj ?? null,
      notas: t.historicoNotas ?? [],
    },
  ];
}

/** Colaborador "padrão" da tarefa (dono do quadro/pessoa resolvida) — só usado quando uma nota
 * específica não tem autor registrado (notas legadas, ou herdadas da semente de notaResolucao
 * antiga). Prioriza o indivíduo resolvido (Mapeamento de Empreendimentos ou destino fixo de regra
 * — ver responsavelNome em roles.ts/dynamicRuleEngine.ts); sem ele, o rótulo do quadro. */
function colaboradorDaTarefa(t: Tarefa): string {
  return t.responsavelNome?.trim() || QUADRO_LABEL[t.praca];
}

function normalizarNomeCurto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(" ")[0];
}

/**
 * Colaborador de UMA nota específica: o autor real de quem clicou "Marcar como feita" e digitou
 * aquele "O que foi feito" (ver marcarTarefaResolvida em tarefasService.ts, que grava
 * `autor: profile.nome`) — nunca o dono atual do quadro/tarefa. Uma tarefa escalada ou que já
 * trocou de mãos tem notas de pessoas diferentes; herdar o dono atual da tarefa para TODAS as
 * notas (como o relatório fazia antes) atribuía produção de um colaborador a outro só por estarem
 * na mesma pasta. Cai no colaborador padrão da tarefa só quando a nota não tem autor gravado.
 */
function colaboradorDaNota(nota: NotaResolucao, t: Tarefa): string {
  return nota.autor?.trim() || colaboradorDaTarefa(t);
}

/**
 * A nota foi mesmo escrita pela pessoa selecionada no filtro "Cargo/Pessoa"? Compara pelo
 * primeiro nome (normalizado, sem acento) — `autor` grava o nome de exibição de quem resolveu
 * (ex.: "Paulo"), e o rótulo do filtro é a mesma pessoa com um sufixo de contexto (ex.: "Paulo
 * (Coordenador)"); o primeiro nome sempre coincide porque é a mesma pessoa física. Sem filtro
 * (`colaboradorFiltro` null), tudo passa.
 */
function notaEhDoColaboradorFiltrado(colaboradorDaNota: string, colaboradorFiltro: string | null): boolean {
  if (!colaboradorFiltro) return true;
  return normalizarNomeCurto(colaboradorDaNota) === normalizarNomeCurto(colaboradorFiltro);
}

/**
 * Data da atividade da tarefa no período quando ela NÃO tem nenhuma nota de texto — mesmo
 * critério de "teve atividade" do painel (ver tarefaTeveAtividadeNoPeriodo em FiltrosTarefas.tsx),
 * mas aqui minus a própria verificação de nota, já que essa função só é chamada quando a tarefa
 * não tiver nenhuma nota no período. Usada para gerar o registro "Conclusão/Baixa da tarefa" que
 * faz o total do relatório coincidir com o total de tarefas trabalhadas do painel.
 */
function dataAtividadeSemNota(t: Tarefa, inicio: string, fim: string): string | null {
  if (dataNoIntervalo(t.resolvidoEm, inicio, fim)) return t.resolvidoEm!;
  const historico = t.historicoEtapas ?? [];
  for (let i = historico.length - 1; i >= 1; i--) {
    if (historico[i].etapa === historico[i - 1].etapa) continue;
    if (dataNoIntervalo(historico[i].data, inicio, fim)) return historico[i].data;
  }
  return null;
}

function somarPorChave(entradas: { chave: string }[]): TotalPorChave[] {
  const contagem = new Map<string, number>();
  for (const e of entradas) {
    contagem.set(e.chave, (contagem.get(e.chave) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
}

/**
 * Monta o relatório hierárquico Etapa -> Imobiliária -> Contato a partir das tarefas JÁ
 * filtradas pela tela (ver aplicarFiltros em FiltrosTarefas.tsx) — nenhuma consulta nova ao
 * Firestore, tudo em memória sobre o que o painel já tem carregado. Cada "contato" é uma entrada
 * de `historicoNotas` ("O que foi feito") dentro do período; uma tarefa sem nenhuma nota no
 * período, mas incluída no painel por conclusão ou troca de etapa, gera um registro sintético
 * ("Ação: Conclusão/Baixa da tarefa no período") — sem isso o total de contatos do relatório
 * ficaria menor que o total de tarefas trabalhadas mostrado no painel (ver dataAtividadeSemNota).
 *
 * `colaboradorFiltro` (rótulo do "Cargo/Pessoa" selecionado, ou null = sem filtro de pessoa)
 * filtra pelo AUTOR REAL de cada nota (ver colaboradorDaNota), nunca pelo dono atual da tarefa/
 * quadro — uma pasta do quadro da Eliane pode ter uma nota escrita pela Andressa (escalonamento),
 * e selecionar "Eliane" não deve trazer essa nota da Andressa só porque a pasta é da mesma praça.
 */
export function montarRelatorioPainel(
  tarefas: Tarefa[],
  dataInicio: string,
  dataFim: string,
  filtrosAplicados: string[],
  colaboradorFiltro: string | null = null
): RelatorioPainel {
  // (etapa -> (imobiliaria -> contatos[])), nessa ordem pra preservar o agrupamento ao montar `grupos`.
  const porEtapa = new Map<string, Map<string, ContatoRelatorio[]>>();

  for (const t of tarefas) {
    let contribuiuContatoReal = false;

    for (const fonte of fontesPastaDaTarefa(t)) {
      const notasNoPeriodo = fonte.notas.filter((n) => dataNoIntervalo(n.data, dataInicio, dataFim));
      if (notasNoPeriodo.length === 0) continue;

      const etapaLabel = fonte.etapa?.trim() || "Sem etapa";
      const imobiliariaLabel = fonte.imobiliaria?.trim() || "Imobiliária não informada";

      for (const nota of notasNoPeriodo) {
        const colaborador = colaboradorDaNota(nota, t);
        if (!notaEhDoColaboradorFiltrado(colaborador, colaboradorFiltro)) continue;
        contribuiuContatoReal = true;

        if (!porEtapa.has(etapaLabel)) porEtapa.set(etapaLabel, new Map());
        const porImobiliaria = porEtapa.get(etapaLabel)!;
        if (!porImobiliaria.has(imobiliariaLabel)) porImobiliaria.set(imobiliariaLabel, []);
        porImobiliaria.get(imobiliariaLabel)!.push({
          dataHora: nota.data,
          colaborador,
          clienteNome: fonte.clienteNome,
          cpfCnpj: fonte.cpfCnpj,
          resumoAcao: nota.texto,
        });
      }
    }

    // O painel conta a tarefa como "trabalhada no período" por conclusão (resolvidoEm) ou troca de
    // etapa, mesmo sem nenhuma nota de texto (ver tarefaTeveAtividadeNoPeriodo em FiltrosTarefas.tsx).
    // Sem este registro, essas tarefas somem do relatório e o total de contatos fica menor que o
    // total de tarefas trabalhadas mostrado no painel.
    if (!contribuiuContatoReal) {
      const dataSemNota = dataAtividadeSemNota(t, dataInicio, dataFim);
      if (dataSemNota) {
        const colaborador = colaboradorDaTarefa(t);
        if (notaEhDoColaboradorFiltrado(colaborador, colaboradorFiltro)) {
          const etapaLabel = t.etapa?.trim() || "Sem etapa";
          const imobiliariaLabel = t.imobiliaria?.trim() || "Imobiliária não informada";
          if (!porEtapa.has(etapaLabel)) porEtapa.set(etapaLabel, new Map());
          const porImobiliaria = porEtapa.get(etapaLabel)!;
          if (!porImobiliaria.has(imobiliariaLabel)) porImobiliaria.set(imobiliariaLabel, []);
          porImobiliaria.get(imobiliariaLabel)!.push({
            dataHora: dataSemNota,
            colaborador,
            clienteNome: t.clienteNome || `Pasta ${t.numero ?? "sem número"}`,
            cpfCnpj: t.cpfCnpj ?? null,
            resumoAcao: "Ação: Conclusão/Baixa da tarefa no período",
          });
        }
      }
    }
  }

  const grupos: GrupoEtapaRelatorio[] = [...porEtapa.entries()]
    .map(([etapa, porImobiliaria]) => {
      const imobiliarias = [...porImobiliaria.entries()]
        .map(([imobiliaria, contatos]) => ({
          imobiliaria,
          contatos: [...contatos].sort((a, b) => a.dataHora.localeCompare(b.dataHora)),
        }))
        .sort((a, b) => a.imobiliaria.localeCompare(b.imobiliaria, "pt-BR"));
      const totalContatos = imobiliarias.reduce((s, g) => s + g.contatos.length, 0);
      return { etapa, imobiliarias, totalContatos };
    })
    .sort((a, b) => codigoEtapa(a.etapa).localeCompare(codigoEtapa(b.etapa), undefined, { numeric: true }));

  const todosContatos = grupos.flatMap((g) => g.imobiliarias.flatMap((i) => i.contatos));
  const totalPorImobiliaria = new Map<string, number>();
  for (const g of grupos) {
    for (const i of g.imobiliarias) {
      totalPorImobiliaria.set(i.imobiliaria, (totalPorImobiliaria.get(i.imobiliaria) ?? 0) + i.contatos.length);
    }
  }
  const porImobiliaria = [...totalPorImobiliaria.entries()]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);

  return {
    sumario: {
      periodoInicio: dataInicio || null,
      periodoFim: dataFim || null,
      filtrosAplicados,
      colaboradorFiltro,
      totalContatos: todosContatos.length,
      porColaborador: somarPorChave(todosContatos.map((c) => ({ chave: c.colaborador }))),
      porEtapa: grupos.map((g) => ({ chave: g.etapa, total: g.totalContatos })).sort((a, b) => b.total - a.total),
      porImobiliaria,
    },
    grupos,
  };
}
