// Resumo de movimentação do Dossiê: distribui o recorte filtrado por etapa de destino (ou de
// origem) e monta o texto executivo. Módulo puro (tela, planilha e testes).
import { somenteDigitos } from "@/lib/utils/cpf";
import { formatDateBR } from "@/lib/utils/dates";
import type { FiltrosMovimentacao, Movimento } from "@/lib/utils/movimentacoes";

/** "destino" = para onde foram; "origem" = de onde vieram. */
export type ModoFunil = "destino" | "origem";

/** Grupos que não são um código de etapa. */
const NOVA = "nova";
const SEM_MUDANCA = "sem-mudanca";

export interface LinhaFunil {
  pasta: { numero: string; cpfCnpj?: string | null };
  /** Movimentação que atendeu o filtro. */
  movimento: Movimento | null;
}

export interface GrupoFunil {
  chave: string;
  /** Nome oficial da etapa ("5.03 - Emissão do contrato"). */
  nome: string;
  /** Rótulo do fluxo ("3.07 → 5.03 · Emissão do contrato"). */
  fluxo: string;
  origem: string;
  destino: string;
  clientes: number;
  percentual: number;
}

export interface Funil {
  modo: ModoFunil;
  totalClientes: number;
  totalPastas: number;
  subtitulo: string;
  /** Observação sobre como ler a distribuição, quando necessária. */
  notas: string[];
  grupos: GrupoFunil[];
}

/** "Saiu da" manda olhar o destino; sem ele, "Entrou na" ou "Etapa atual" olham a origem. */
export function modoDoFunil(f: FiltrosMovimentacao): ModoFunil {
  return !f.saiu && (f.entrou || f.etapaAtual) ? "origem" : "destino";
}

export function chaveDoGrupo(movimento: Movimento | null, modo: ModoFunil): string {
  if (!movimento) return SEM_MUDANCA;
  return modo === "destino" ? movimento.para : (movimento.de ?? NOVA);
}

/** Um cliente com várias pastas conta uma vez só (por CPF/CNPJ). */
export function chaveCliente(pasta: LinhaFunil["pasta"]): string {
  return somenteDigitos(pasta.cpfCnpj ?? "") || pasta.numero;
}

export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export const contagemClientes = (n: number) => `${n} cliente${n === 1 ? "" : "s"}`;

export function montarFunil(linhas: LinhaFunil[], f: FiltrosMovimentacao, etapas: Record<string, string>): Funil {
  const modo = modoDoFunil(f);
  const oficial = (codigo: string) => etapas[codigo] ?? codigo;
  const curto = (codigo: string) => oficial(codigo).replace(" - ", " · ");
  const referencia = modo === "destino" ? f.saiu : f.entrou || f.etapaAtual;

  const porGrupo = new Map<string, Set<string>>();
  const todos = new Set<string>();
  for (const l of linhas) {
    const chave = chaveDoGrupo(l.movimento, modo);
    const cliente = chaveCliente(l.pasta);
    todos.add(cliente);
    const grupo = porGrupo.get(chave) ?? new Set<string>();
    porGrupo.set(chave, grupo.add(cliente));
  }

  const grupos = [...porGrupo].map(([chave, clientes]): GrupoFunil => {
    const especial = chave === NOVA ? "Nova na base" : chave === SEM_MUDANCA ? "Sem mudança registrada" : null;
    const nome = especial ?? oficial(chave);
    const proprio = especial ?? curto(chave);
    const fluxo = !referencia || chave === SEM_MUDANCA ? proprio : modo === "destino" ? `${referencia} → ${proprio}` : `${proprio} → ${referencia}`;
    const outra = referencia ? oficial(referencia) : chave === SEM_MUDANCA ? "—" : "Diversas";
    return {
      chave,
      nome,
      fluxo,
      origem: modo === "destino" ? outra : nome,
      destino: modo === "destino" ? nome : outra,
      clientes: clientes.size,
      percentual: (clientes.size / todos.size) * 100,
    };
  });
  grupos.sort((a, b) => b.clientes - a.clientes || a.chave.localeCompare(b.chave, undefined, { numeric: true }));

  const total = `(Total: ${contagemClientes(todos.size)})`;
  const noPeriodo = f.de || f.ate ? " no período" : "";
  let subtitulo: string;
  if (f.saiu) subtitulo = `Origem: ${oficial(f.saiu)} → Distribuição por Etapa de Destino ${total}`;
  else if (f.entrou) subtitulo = `Entrada em: ${oficial(f.entrou)} ← Distribuição por Etapa de Origem · De onde vieram ${total}`;
  else if (f.etapaAtual) subtitulo = `Etapa atual: ${oficial(f.etapaAtual)} ← Distribuição por Etapa de Origem · De onde vieram ${total}`;
  else subtitulo = `Distribuição por Etapa de Destino da última movimentação${noPeriodo} ${total}`;

  const notas: string[] = [];
  if (f.saiu && f.entrou && (f.de || f.ate)) {
    notas.push(`O destino é a primeira etapa depois de sair da ${f.saiu}, no caminho até a ${f.entrou}.`);
  }
  if (grupos.reduce((n, g) => n + g.clientes, 0) > todos.size) {
    notas.push("Há cliente com mais de uma pasta em etapas diferentes, por isso a soma passa de 100%.");
  }

  return { modo, totalClientes: todos.size, totalPastas: linhas.length, subtitulo, notas, grupos };
}

/** Filtros do recorte em linhas legíveis, para o texto copiado e a planilha. */
export function descreverFiltros(f: FiltrosMovimentacao, etapas: Record<string, string>, cliente: string): [string, string][] {
  const oficial = (codigo: string) => etapas[codigo] ?? codigo;
  const itens: [string, string][] = [];
  if (cliente) itens.push(["Cliente", cliente]);
  if (f.etapaAtual) itens.push(["Etapa atual", oficial(f.etapaAtual)]);
  if (f.saiu) itens.push(["Saiu da etapa (origem)", oficial(f.saiu)]);
  if (f.entrou) itens.push(["Entrou na etapa (destino)", oficial(f.entrou)]);
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

/** Texto pronto para WhatsApp/e-mail. Só números por etapa: nenhum dado de cliente além do filtro. */
export function textoResumo(funil: Funil, filtros: [string, string][]): string {
  const pastas = funil.totalPastas !== funil.totalClientes ? ` (${funil.totalPastas} pastas)` : "";
  return [
    "*Resumo de Movimentação e Conversão*",
    "",
    ...filtros.map(([rotulo, valor]) => `• ${rotulo}: ${valor}`),
    "",
    `*Total: ${contagemClientes(funil.totalClientes)}*${pastas}`,
    "",
    funil.modo === "destino" ? "*Ranking por etapa de destino*" : "*Ranking por etapa de origem (de onde vieram)*",
    ...funil.grupos.map((g, i) => `${i + 1}. ${g.fluxo}: ${contagemClientes(g.clientes)} (${formatarPercentual(g.percentual)})`),
    ...(funil.notas.length ? ["", ...funil.notas.map((n) => `Obs.: ${n}`)] : []),
  ].join("\n");
}
