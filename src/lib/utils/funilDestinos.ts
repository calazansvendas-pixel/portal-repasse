// Resumo de movimentação do Dossiê: dá a cada pasta do recorte uma etapa de origem e uma de
// destino, distribui por qualquer uma das duas e monta o texto executivo. Módulo puro.
import { codigoEtapa } from "@/lib/auth/roles";
import { somenteDigitos } from "@/lib/utils/cpf";
import { formatDateBR } from "@/lib/utils/dates";
import type { FiltrosMovimentacao, Movimento } from "@/lib/utils/movimentacoes";

/** "destino" = para onde foram; "origem" = de onde vieram. */
export type Dimensao = "destino" | "origem";

/** Chave escolhida em cada seletor; "" = todas. */
export type Selecao = Record<Dimensao, string>;
export const SEM_SELECAO: Selecao = { origem: "", destino: "" };

/** Grupos que não são um código de etapa. */
const NOVA = "nova";
const SEM_MUDANCA = "sem-mudanca";

export interface LinhaFunil {
  pasta: { numero: string; cpfCnpj?: string | null; etapa?: string | null; movimentos: Movimento[] };
  /** Movimentação que atendeu o filtro (um dos itens de `pasta.movimentos`). */
  movimento: Movimento | null;
}

export interface GrupoFunil {
  chave: string;
  /** Nome oficial da etapa ("5.03 - Emissão do contrato"). */
  nome: string;
  /** Rótulo do fluxo ("3.07 → 5.03 · Emissão do contrato"). */
  fluxo: string;
  clientes: number;
  percentual: number;
}

export interface ParFunil {
  origem: string;
  destino: string;
  clientes: number;
  percentual: number;
}

export interface Funil {
  visao: Dimensao;
  /** Totais do recorte filtrado, antes dos seletores. */
  totalClientes: number;
  totalPastas: number;
  /** Clientes que atendem aos dois seletores. */
  selecionados: number;
  subtitulo: string;
  /** Observação sobre como ler a distribuição, quando necessária. */
  notas: string[];
  /** Opções de cada seletor (com a contagem dentro do que o OUTRO seletor deixou). */
  opcoes: Record<Dimensao, GrupoFunil[]>;
  /** Blocos exibidos: a visão atual, respeitando os dois seletores. */
  chips: GrupoFunil[];
  /** Fluxos origem → destino do recorte inteiro, para a planilha. */
  pares: ParFunil[];
}

/** Só "Entrou na": o destino é para onde a pasta foi DEPOIS de entrar. */
const aposEntrada = (f: FiltrosMovimentacao) => !!f.entrou && !f.saiu;

/**
 * Origem e destino de uma pasta do recorte. Com "Saiu da", é a própria saída. Com "Entrou na", a
 * origem é de onde veio e o destino é a etapa seguinte (ou a própria, se não saiu dela).
 */
export function pontas(l: LinhaFunil, f: FiltrosMovimentacao): Selecao {
  const m = l.movimento;
  if (!m) return { origem: SEM_MUDANCA, destino: codigoEtapa(l.pasta.etapa ?? "") || SEM_MUDANCA };
  const seguinte = aposEntrada(f) ? l.pasta.movimentos[l.pasta.movimentos.indexOf(m) + 1] : undefined;
  return { origem: m.de ?? NOVA, destino: (seguinte ?? m).para };
}

const atende = (p: Selecao, s: Selecao) => (!s.origem || p.origem === s.origem) && (!s.destino || p.destino === s.destino);

export function filtrarPorSelecao<T extends LinhaFunil>(linhas: T[], f: FiltrosMovimentacao, s: Selecao): T[] {
  return s.origem || s.destino ? linhas.filter((l) => atende(pontas(l, f), s)) : linhas;
}

/** Um cliente com várias pastas conta uma vez só (por CPF/CNPJ). */
export function chaveCliente(pasta: { numero: string; cpfCnpj?: string | null }): string {
  return somenteDigitos(pasta.cpfCnpj ?? "") || pasta.numero;
}

export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export const contagemClientes = (n: number) => `${n} cliente${n === 1 ? "" : "s"}`;

const contar = (linhas: LinhaFunil[]) => new Set(linhas.map((l) => chaveCliente(l.pasta))).size;

/** Agrupa por uma chave e conta clientes distintos, do maior volume para o menor. */
function agrupar<T extends LinhaFunil>(linhas: T[], chave: (l: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    const lista = grupos.get(k);
    if (lista) lista.push(l);
    else grupos.set(k, [l]);
  }
  const total = contar(linhas);
  return [...grupos]
    .map(([k, lista]) => ({ chave: k, clientes: contar(lista), percentual: (contar(lista) / total) * 100 }))
    .sort((a, b) => b.clientes - a.clientes || a.chave.localeCompare(b.chave, undefined, { numeric: true }));
}

export function montarFunil(
  linhas: LinhaFunil[],
  f: FiltrosMovimentacao,
  etapas: Record<string, string>,
  visao: Dimensao = "destino",
  selecao: Selecao = SEM_SELECAO
): Funil {
  const oficial = (codigo: string) => etapas[codigo] ?? codigo;
  const curto = (codigo: string) => oficial(codigo).replace(" - ", " · ");
  const permanece = (dim: Dimensao, chave: string) => dim === "destino" && aposEntrada(f) && chave === f.entrou;

  function nomear(dim: Dimensao, chave: string): string {
    if (chave === NOVA) return "Nova na base";
    if (chave === SEM_MUDANCA) return "Sem mudança registrada";
    return permanece(dim, chave) ? `${oficial(chave)} (permanece na etapa)` : oficial(chave);
  }

  /** Etapa do filtro que serve de outra ponta no rótulo do bloco. */
  function rotular(dim: Dimensao, chave: string): string {
    if (chave === NOVA || chave === SEM_MUDANCA) return nomear(dim, chave);
    if (permanece(dim, chave)) return `Permanece na ${curto(chave)}`;
    if (dim === "destino") {
      const de = f.saiu || (aposEntrada(f) ? f.entrou : "");
      return de ? `${de} → ${curto(chave)}` : curto(chave);
    }
    const para = f.saiu ? "" : f.entrou || f.etapaAtual;
    return para ? `${curto(chave)} → ${para}` : curto(chave);
  }

  const distribuir = (dim: Dimensao, base: LinhaFunil[]): GrupoFunil[] =>
    agrupar(base, (l) => pontas(l, f)[dim]).map((g) => ({ ...g, nome: nomear(dim, g.chave), fluxo: rotular(dim, g.chave) }));

  // Cada seletor lista só o que combina com o outro, então nenhuma escolha resulta em zero.
  const opcoes: Record<Dimensao, GrupoFunil[]> = {
    origem: distribuir("origem", filtrarPorSelecao(linhas, f, { origem: "", destino: selecao.destino })),
    destino: distribuir("destino", filtrarPorSelecao(linhas, f, { origem: selecao.origem, destino: "" })),
  };
  const chips = selecao[visao] ? opcoes[visao].filter((g) => g.chave === selecao[visao]) : opcoes[visao];

  const pares = agrupar(linhas, (l) => {
    const p = pontas(l, f);
    return `${p.origem}|${p.destino}`;
  }).map(({ chave, clientes, percentual }): ParFunil => {
    const [origem, destino] = chave.split("|");
    return { origem: nomear("origem", origem), destino: nomear("destino", destino), clientes, percentual };
  });

  const totalClientes = contar(linhas);
  const total = `(Total: ${contagemClientes(totalClientes)})`;
  const titulo = visao === "destino" ? "Distribuição por Etapa de Destino" : "Distribuição por Etapa de Origem";
  const sentido = visao === "destino" ? "Para onde foram" : "De onde vieram";
  let subtitulo: string;
  if (f.saiu) subtitulo = `Origem: ${oficial(f.saiu)} → ${titulo} ${total}`;
  else if (f.entrou) subtitulo = `Entrada em: ${oficial(f.entrou)} · ${titulo} · ${sentido}${visao === "destino" ? " depois" : ""} ${total}`;
  else if (f.etapaAtual) subtitulo = `Etapa atual: ${oficial(f.etapaAtual)} · ${titulo} · ${sentido} ${total}`;
  else subtitulo = `${titulo} da última movimentação${f.de || f.ate ? " no período" : ""} ${total}`;

  const notas: string[] = [];
  const outra: Dimensao = visao === "destino" ? "origem" : "destino";
  if (selecao[outra]) {
    notas.push(`Os percentuais dos blocos consideram só os clientes da ${outra === "origem" ? "origem escolhida" : "etapa de destino escolhida"}.`);
  }
  if (visao === "destino" && aposEntrada(f)) {
    notas.push(
      `O destino é a primeira etapa depois da entrada na ${f.entrou}${f.de || f.ate ? ", mesmo que a mudança seja posterior ao período" : ""}.`
    );
  }
  if (f.saiu && f.entrou && (f.de || f.ate)) {
    notas.push(`O destino é a primeira etapa depois de sair da ${f.saiu}, no caminho até a ${f.entrou}.`);
  }
  if (chips.reduce((n, g) => n + g.percentual, 0) > 100.01) {
    notas.push("Há cliente com mais de uma pasta em etapas diferentes, por isso a soma passa de 100%.");
  }

  return {
    visao,
    totalClientes,
    totalPastas: linhas.length,
    selecionados: contar(filtrarPorSelecao(linhas, f, selecao)),
    subtitulo,
    notas,
    opcoes,
    chips,
    pares,
  };
}

/** Frase do destaque: quantos do recorte atendem ao que foi escolhido nos seletores. "" = nada. */
export function fraseSelecao(funil: Funil, selecao: Selecao): string {
  const nome = (dim: Dimensao) => funil.opcoes[dim].find((g) => g.chave === selecao[dim])?.nome;
  const origem = selecao.origem ? nome("origem") : undefined;
  const destino = selecao.destino ? nome("destino") : undefined;
  if (!origem && !destino) return "";

  const um = funil.selecionados === 1;
  const partes: string[] = [];
  if (origem) {
    if (selecao.origem === NOVA) partes.push(`${um ? "apareceu" : "apareceram"} como pasta nova na base`);
    else if (selecao.origem === SEM_MUDANCA) partes.push(`${um ? "não tem" : "não têm"} mudança de etapa registrada`);
    else partes.push(`${um ? "veio" : "vieram"} de ${origem}`);
  }
  if (destino) {
    const ficou = destino.endsWith("(permanece na etapa)");
    if (selecao.destino === SEM_MUDANCA) partes.push(`${um ? "não tem" : "não têm"} etapa de destino registrada`);
    else if (ficou) partes.push(`${um ? "permanece" : "permanecem"} na ${destino.replace(" (permanece na etapa)", "")}`);
    else partes.push(`${um ? "foi" : "foram"} para ${destino}`);
  }
  const percentual = formatarPercentual((funil.selecionados / funil.totalClientes) * 100);
  return `${funil.selecionados} de ${contagemClientes(funil.totalClientes)} (${percentual}) ${partes.join(" e ")}`;
}

/** Filtros do recorte em linhas legíveis, para o texto copiado e a planilha. */
export function descreverFiltros(f: FiltrosMovimentacao, etapas: Record<string, string>, cliente: string): [string, string][] {
  const oficial = (codigo: string) => etapas[codigo] ?? codigo;
  const itens: [string, string][] = [];
  if (cliente) itens.push(["Cliente", cliente]);
  if (f.etapaAtual) itens.push(["Etapa atual", oficial(f.etapaAtual)]);
  if (f.saiu) itens.push(["Saiu da etapa", oficial(f.saiu)]);
  if (f.entrou) itens.push(["Entrou na etapa", oficial(f.entrou)]);
  const periodo =
    f.de && f.ate
      ? `de ${formatDateBR(f.de)} a ${formatDateBR(f.ate)}`
      : f.de
        ? `a partir de ${formatDateBR(f.de)}`
        : f.ate
          ? `até ${formatDateBR(f.ate)}`
          : "todas as datas";
  itens.push(["Período", periodo]);
  return itens;
}

/**
 * Texto pronto para WhatsApp/e-mail: ranking do recorte inteiro na visão atual, mais a seleção.
 * Só números por etapa — nenhum dado de cliente além do que foi filtrado.
 */
export function textoResumo(funil: Funil, filtros: [string, string][], selecao = ""): string {
  const pastas = funil.totalPastas !== funil.totalClientes ? ` (${funil.totalPastas} pastas)` : "";
  return [
    "*Resumo de Movimentação e Conversão*",
    "",
    ...filtros.map(([rotulo, valor]) => `• ${rotulo}: ${valor}`),
    "",
    `*Total: ${contagemClientes(funil.totalClientes)}*${pastas}`,
    ...(selecao ? [`Seleção: ${selecao}`] : []),
    "",
    funil.visao === "destino" ? "*Ranking por etapa de destino*" : "*Ranking por etapa de origem (de onde vieram)*",
    ...funil.chips.map((g, i) => `${i + 1}. ${g.fluxo}: ${contagemClientes(g.clientes)} (${formatarPercentual(g.percentual)})`),
    ...(funil.notas.length ? ["", ...funil.notas.map((n) => `Obs.: ${n}`)] : []),
  ].join("\n");
}
