// Limpa o que chega da tela antes de gravar: só campos conhecidos, com tamanhos limitados.
import type { EtapaOrganograma, ItemChecklist, Modalidade, Papel, Praca } from "./tipos";

export const CODIGO_VALIDO = /^\d{1,2}\.\d{2,3}$/;
const ID_VALIDO = /^[a-z0-9_]{1,40}$/;

const texto = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const semRepetir = <T extends { id: string }>(itens: T[]) => itens.filter((x, i) => itens.findIndex((y) => y.id === x.id) === i);

function lerPapel(bruto: unknown): Papel | null {
  const p = objeto(bruto);
  const id = texto(p.id, 40);
  const rotulo = texto(p.rotulo, 80);
  if (!ID_VALIDO.test(id) || !rotulo) return null;
  const porPraca: Record<string, string> = {};
  for (const [praca, nome] of Object.entries(objeto(p.porPraca))) {
    if (ID_VALIDO.test(praca) && texto(nome)) porPraca[praca] = texto(nome, 120);
  }
  return { id, rotulo, todas: texto(p.todas, 120), porPraca };
}

function lerItem(bruto: unknown): ItemChecklist | null {
  const i = objeto(bruto);
  const id = texto(i.id, 40);
  const rotulo = texto(i.texto, 300);
  // "__" é reservado para a chave do 2º proponente.
  if (!ID_VALIDO.test(id) || id.includes("__") || !rotulo) return null;
  const tipo = i.tipo === "opcoes" || i.tipo === "texto" ? i.tipo : "marca";
  const opcoes = tipo === "opcoes" ? lista(i.opcoes, 20).map((o) => texto(o, 80)).filter(Boolean) : undefined;
  return { id, texto: rotulo, tipo, ...(opcoes ? { opcoes } : {}), ...(i.porProponente === true ? { porProponente: true } : {}) };
}

function lerModalidade(bruto: unknown): Modalidade | null {
  const m = objeto(bruto);
  const id = texto(m.id, 40);
  const nome = texto(m.nome, 80);
  if (!ID_VALIDO.test(id) || !nome) return null;
  const itens = lista(m.itens, 80).map(lerItem).filter((i): i is ItemChecklist => !!i);
  return { id, nome, itens: semRepetir(itens) };
}

/** Devolve a etapa limpa ou a mensagem de erro. */
export function lerEtapa(bruto: unknown): EtapaOrganograma | string {
  const e = objeto(bruto);
  const codigo = texto(e.codigo, 10);
  if (!CODIGO_VALIDO.test(codigo)) return "Código de etapa inválido.";
  const nome = texto(e.nome, 120);
  if (!nome) return "Dê um nome à etapa.";
  const dias = e.slaDias;
  if (dias !== null && !(Number.isInteger(dias) && (dias as number) >= 1 && (dias as number) <= 365)) {
    return "O prazo precisa ser um número inteiro de 1 a 365 dias, ou ficar vazio.";
  }
  const bloco = Number(e.bloco);
  const papeis = semRepetir(lista(e.papeis, 10).map(lerPapel).filter((p): p is Papel => !!p));
  const escalonamento = texto(e.papelEscalonamento, 40);
  return {
    codigo,
    bloco: Number.isInteger(bloco) && bloco >= 1 && bloco <= 9 ? bloco : 9,
    nome,
    funcao: texto(e.funcao, 1000),
    fluxoEsperado: texto(e.fluxoEsperado, 500),
    slaDias: dias as number | null,
    papeis,
    papelEscalonamento: papeis.some((p) => p.id === escalonamento) ? escalonamento : null,
    selos: lista(e.selos, 6).map((s) => texto(s, 40)).filter(Boolean),
    alerta: e.alerta === true,
    conferirNaEntrada: e.conferirNaEntrada === true,
    permiteCasal: e.permiteCasal === true,
    modalidades: semRepetir(lista(e.modalidades, 20).map(lerModalidade).filter((m): m is Modalidade => !!m)),
  };
}

export function lerPracas(bruto: unknown): Praca[] | string {
  const pracas = lista(bruto, 30).map((x): Praca | null => {
    const p = objeto(x);
    const id = texto(p.id, 40);
    const nome = texto(p.nome, 60);
    const termos = lista(p.termos, 10).map((t) => texto(t, 60)).filter(Boolean);
    return ID_VALIDO.test(id) && nome && termos.length ? { id, nome, termos } : null;
  });
  if (!pracas.length || pracas.some((p) => !p)) return "Cada praça precisa de nome e de ao menos um termo de busca.";
  return semRepetir(pracas as Praca[]);
}

/** "Jardim Camburi" -> "jardim_camburi". */
export function criarId(nome: string, usados: string[] = []): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "item";
  let id = base;
  for (let n = 2; usados.includes(id); n++) id = `${base}_${n}`;
  return id;
}
