import type { Tarefa } from "@/lib/types";

/**
 * Edição otimista de tarefas: ao salvar no modal "Editar Tarefa" o card já muda na tela (texto,
 * coluna, responsável, data limite) sem esperar o PATCH nem o onSnapshot. A edição fica como uma
 * CAMADA por cima da tarefa lida do Firestore e some sozinha quando o servidor responde: o
 * `atualizadoEm` do documento muda (o PATCH sempre o regrava) e a camada passa a ser ignorada. Se o
 * PATCH falha, a camada é removida (o card volta ao que era) e quem chamou mostra o aviso.
 */

interface Edicao {
  campos: Partial<Tarefa>;
  /** `atualizadoEm` da tarefa quando a edição foi feita — mudou = o servidor já confirmou. */
  baseAtualizadoEm: string | undefined;
}

const SEM_EDICOES: ReadonlyMap<string, Edicao> = new Map();
let edicoes: ReadonlyMap<string, Edicao> = SEM_EDICOES;
const ouvintes = new Set<() => void>();

function publicar(novas: Map<string, Edicao>) {
  edicoes = novas;
  ouvintes.forEach((ouvir) => ouvir());
}

export function assinarEdicoesOtimistas(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}

export const lerEdicoesOtimistas = () => edicoes;
export const lerEdicoesOtimistasNoServidor = () => SEM_EDICOES;

export function aplicarEdicaoOtimista(id: string, campos: Partial<Tarefa>, baseAtualizadoEm: string | undefined) {
  publicar(new Map(edicoes).set(id, { campos, baseAtualizadoEm }));
}

export function reverterEdicaoOtimista(id: string) {
  if (!edicoes.has(id)) return;
  const novas = new Map(edicoes);
  novas.delete(id);
  publicar(novas);
}

/** O PATCH deu certo. A camada sai quando o snapshot trouxer a versão nova; se ele demorar (ou a
 * tarefa sair da consulta), sai sozinha depois de um tempo — o servidor já tem a verdade. */
export function confirmarEdicaoOtimista(id: string, aposMs = 15000) {
  setTimeout(() => reverterEdicaoOtimista(id), aposMs);
}

/** Sobrepõe as edições otimistas pendentes às tarefas lidas do Firestore. */
export function mesclarEdicoesOtimistas(tarefas: Tarefa[], pendentes: ReadonlyMap<string, Edicao>): Tarefa[] {
  if (pendentes.size === 0) return tarefas;
  return tarefas.map((t) => {
    const edicao = pendentes.get(t.id);
    if (!edicao || t.atualizadoEm !== edicao.baseAtualizadoEm) return t;
    return { ...t, ...edicao.campos };
  });
}
