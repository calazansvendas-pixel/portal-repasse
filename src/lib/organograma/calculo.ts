// Cálculos do funil vivo, cobertura de responsáveis e itens de checklist. Módulo puro.
import { codigoEtapa, normalize } from "@/lib/auth/roles";
import type {
  ChecklistEtapa,
  EtapaOrganograma,
  ItemChecklist,
  Papel,
  PastaFunil,
  PassoTrajeto,
  Praca,
} from "./tipos";

/** Praça de quem não casa com nenhum termo cadastrado. */
export const SEM_PRACA = "sem_praca";

/** Primeiro o empreendimento (Morada Vitória), depois a cidade. */
export function pracaDaPasta(pasta: { produto?: string; cidade?: string }, pracas: Praca[]): string {
  for (const texto of [normalize(pasta.produto ?? ""), normalize(pasta.cidade ?? "")]) {
    if (!texto) continue;
    const achada = pracas.find((p) => p.termos.some((t) => t.trim() && texto.includes(normalize(t))));
    if (achada) return achada.id;
  }
  return SEM_PRACA;
}

/** Agrupa os passos diários do trajeto: um por permanência na etapa. */
export function resumirTrajeto(historico: { etapa?: string; data: string }[]): PassoTrajeto[] {
  const passos: PassoTrajeto[] = [];
  for (const h of historico) {
    const codigo = codigoEtapa(h.etapa ?? "");
    if (codigo && passos[passos.length - 1]?.codigo !== codigo) passos.push({ codigo, data: h.data });
  }
  return passos;
}

export function diasEntre(inicio: string, fim: string): number {
  const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((dia(fim) - dia(inicio)) / 86_400_000));
}

/** Há quantos dias corridos a pasta está na etapa atual; null quando não há data. */
export function diasNaEtapa(pasta: PastaFunil, hoje: string): { desde: string; dias: number } | null {
  const atual = codigoEtapa(pasta.etapa);
  const ultimo = pasta.trajeto[pasta.trajeto.length - 1];
  let desde = ultimo?.codigo === atual ? ultimo.data : null;
  // Na inclusão, quem nunca saiu dela está lá desde a data de entrada da pasta.
  if (atual === "0.01" && pasta.trajeto.length <= 1 && pasta.dataEntrada) {
    const entrada = pasta.dataEntrada.slice(0, 10);
    if (!desde || entrada < desde) desde = entrada;
  }
  return desde ? { desde, dias: diasEntre(desde, hoje) } : null;
}

export function prazoDaPasta(etapa: EtapaOrganograma | undefined): number | null {
  return etapa?.slaDias ?? null;
}

export interface Metricas {
  entraram: number;
  paradas: number;
  acimaDoPrazo: number;
  saidas: { para: string; pastas: number }[];
  /** Paradas por praça. */
  porPraca: Record<string, number>;
}

const vazias = (): Metricas => ({ entraram: 0, paradas: 0, acimaDoPrazo: 0, saidas: [], porPraca: {} });

/** Métricas de todas as etapas que aparecem nas planilhas. Uma pasta conta uma vez por métrica. */
export function calcularMetricas(pastas: PastaFunil[], etapas: EtapaOrganograma[], pracas: Praca[], hoje: string): Record<string, Metricas> {
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]));
  const resultado: Record<string, Metricas> = {};
  const saidas: Record<string, Map<string, number>> = {};
  const de = (codigo: string) => (resultado[codigo] ??= vazias());

  for (const pasta of pastas) {
    const atual = codigoEtapa(pasta.etapa);
    const visitadas = new Set(pasta.trajeto.map((p) => p.codigo));
    if (atual) visitadas.add(atual);
    for (const codigo of visitadas) de(codigo).entraram++;

    const pares = new Set<string>();
    for (let i = 1; i < pasta.trajeto.length; i++) pares.add(`${pasta.trajeto[i - 1].codigo}|${pasta.trajeto[i].codigo}`);
    for (const par of pares) {
      const [origem, destino] = par.split("|");
      const mapa = (saidas[origem] ??= new Map());
      mapa.set(destino, (mapa.get(destino) ?? 0) + 1);
    }

    if (!atual) continue;
    const m = de(atual);
    m.paradas++;
    const praca = pracaDaPasta(pasta, pracas);
    m.porPraca[praca] = (m.porPraca[praca] ?? 0) + 1;
    const prazo = prazoDaPasta(porCodigo.get(atual));
    const tempo = diasNaEtapa(pasta, hoje);
    if (prazo !== null && tempo && tempo.dias >= prazo) m.acimaDoPrazo++;
  }
  for (const [codigo, mapa] of Object.entries(saidas)) {
    de(codigo).saidas = [...mapa]
      .map(([para, n]) => ({ para, pastas: n }))
      .sort((a, b) => b.pastas - a.pastas || a.para.localeCompare(b.para, undefined, { numeric: true }));
  }
  return resultado;
}

/** Quem exerce o papel naquela praça (o nome da praça vale mais que o geral). */
export const responsavelDoPapel = (papel: Papel, praca: string): string => (papel.porPraca[praca] || papel.todas || "").trim();

export const temResponsavel = (etapa: EtapaOrganograma | undefined): boolean =>
  !!etapa?.papeis.some((p) => p.todas.trim() || Object.values(p.porPraca).some((v) => v.trim()));

export interface Descoberta {
  codigo: string;
  /** null = a etapa inteira; senão, as praças com pastas paradas sem ninguém. */
  pracas: string[] | null;
}

/** Etapas das planilhas sem responsável, no todo ou em alguma praça com pasta parada. */
export function etapasDescobertas(metricas: Record<string, Metricas>, etapas: EtapaOrganograma[]): Descoberta[] {
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]));
  return Object.entries(metricas)
    .flatMap(([codigo, m]): Descoberta[] => {
      const etapa = porCodigo.get(codigo);
      if (!temResponsavel(etapa)) return [{ codigo, pracas: null }];
      const semNinguem = Object.keys(m.porPraca).filter((praca) => !etapa!.papeis.some((p) => responsavelDoPapel(p, praca)));
      return semNinguem.length ? [{ codigo, pracas: semNinguem }] : [];
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
}

// ------------------------------------------------------------------------------------ checklist

export interface ItemExpandido extends ItemChecklist {
  /** Chave da resposta: "ficha_morar" ou "ficha_morar__2" para o 2º proponente. */
  chave: string;
  rotulo: string;
}

export function modalidadeEscolhida(etapa: EtapaOrganograma, marcado: ChecklistEtapa | undefined) {
  return etapa.modalidades.find((m) => m.id === marcado?.modalidadeId) ?? etapa.modalidades[0] ?? null;
}

export function itensDoChecklist(etapa: EtapaOrganograma, marcado: ChecklistEtapa | undefined): ItemExpandido[] {
  const itens = modalidadeEscolhida(etapa, marcado)?.itens ?? [];
  const casal = etapa.permiteCasal && !!marcado?.casal;
  const primeiro = itens.map((i) => ({ ...i, chave: i.id, rotulo: casal && i.porProponente ? `${i.texto} — 1º proponente` : i.texto }));
  if (!casal) return primeiro;
  return [
    ...primeiro,
    ...itens.filter((i) => i.porProponente).map((i) => ({ ...i, chave: `${i.id}__2`, rotulo: `${i.texto} — 2º proponente` })),
  ];
}

export function progressoDoChecklist(etapa: EtapaOrganograma, marcado: ChecklistEtapa | undefined): { feitos: number; total: number } {
  const itens = itensDoChecklist(etapa, marcado);
  return { feitos: itens.filter((i) => !!marcado?.respostas?.[i.chave]?.valor).length, total: itens.length };
}
