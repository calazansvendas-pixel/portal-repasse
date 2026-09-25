"use client";

import { arrayUnion, doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ClienteEnvolvido, NotaResolucao, Quadro, Tarefa } from "@/lib/types";

/** Texto do registro automático do God Mode (não é uma justificativa escrita pelo colaborador). */
const NOTA_GERENCIA = "Marcada como feita pela Gerência.";

function exigirNota(nota: string | undefined): string {
  const texto = (nota ?? "").trim();
  if (!texto) throw new Error("Descreva o que foi feito para concluir.");
  return texto;
}

/** Notas antigas (anteriores ao histórico) viram a primeira entrada, para nunca se perderem. */
function semente(historico: NotaResolucao[] | undefined, notaLegada: string | null | undefined, data: string | null | undefined) {
  return !historico?.length && notaLegada ? [{ texto: notaLegada, data: data ?? "", autor: null }] : [];
}

/**
 * Assistente marca a tarefa como resolvida. A nota "O que foi feito" é OBRIGATÓRIA e entra no
 * histórico de tentativas (imutável: cada nova tentativa acumula, nada é sobrescrito). Isso NÃO
 * fecha a tarefa definitivamente: ela vai para "pending_validation" até a próxima importação de
 * planilha confirmar (ou não) o avanço da etapa — ver auditEngine.ts.
 */
export async function marcarTarefaResolvida(tarefa: Tarefa, uid: string, nota: string, autor?: string | null) {
  const texto = exigirNota(nota);
  const agora = new Date().toISOString();
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: agora,
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
    notaResolucao: texto,
    historicoNotas: arrayUnion(
      ...semente(tarefa.historicoNotas, tarefa.notaResolucao, tarefa.resolvidoEm),
      { texto, data: agora, autor: autor ?? null }
    ),
  });
}

/**
 * Marca/desmarca UM cliente dentro de uma tarefa agregada (gargalo). A tarefa
 * mãe só entra em "pending_validation" quando todos os clientes estão
 * marcados; desmarcar qualquer um a devolve para "pendente".
 * Concluir com `nota` (modal do cliente) exige texto e ACUMULA a tentativa no histórico do cliente.
 * Sem `nota` (check rápido da lista) nada do histórico muda; desmarcar NUNCA apaga notas.
 */
export async function alternarClienteEnvolvido(
  tarefaId: string,
  numero: string,
  uid: string,
  nota?: string,
  autor?: string | null
) {
  const ref = doc(db, "tarefas", tarefaId);
  const texto = nota === undefined ? undefined : exigirNota(nota);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const tarefa = snap.data() as Tarefa | undefined;
    if (!tarefa) throw new Error("Tarefa não encontrada.");

    const agora = new Date().toISOString();
    let notaDoClique: string | null = null;
    const clientes = (tarefa.clientesEnvolvidos ?? []).map((c) => {
      if (c.numero !== numero) return c;
      const concluido = !c.concluido;
      if (!concluido || texto === undefined) return { ...c, concluido };
      notaDoClique = texto;
      return {
        ...c,
        concluido,
        notaResolucao: texto,
        historicoNotas: [
          ...(c.historicoNotas ?? semente(undefined, c.notaResolucao, null)),
          { texto, data: agora, autor: autor ?? null },
        ],
      };
    });
    const todosConcluidos = clientes.length > 0 && clientes.every((c) => c.concluido);

    const mudanca: Record<string, unknown> = { clientesEnvolvidos: clientes };
    if (todosConcluidos && tarefa.status !== "pending_validation") {
      Object.assign(mudanca, {
        status: "pending_validation",
        resolvidoPor: uid,
        resolvidoEm: agora,
        etapaNoMomentoResolucao: tarefa.etapa,
        observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
        notaResolucao: notaDoClique ?? tarefa.notaResolucao ?? null,
      });
    } else if (!todosConcluidos && tarefa.status === "pending_validation") {
      Object.assign(mudanca, camposDeTarefaAtiva());
    }
    tx.update(ref, mudanca);
  });
}

/**
 * Volta a tarefa para "pendente" mexendo só no estado da conclusão. As notas (última nota e
 * histórico de tentativas) nunca são tocadas: quem escreveu precisa reler o que tentou.
 */
function camposDeTarefaAtiva() {
  return {
    status: "pendente",
    resolvidoPor: null,
    resolvidoEm: null,
    etapaNoMomentoResolucao: null,
    observacaoNoMomentoResolucao: null,
  };
}

function comClientes(tarefa: Tarefa, concluido: boolean): { clientesEnvolvidos?: ClienteEnvolvido[] } {
  return tarefa.clientesEnvolvidos?.length
    ? { clientesEnvolvidos: tarefa.clientesEnvolvidos.map((c) => ({ ...c, concluido })) }
    : {};
}

/**
 * Devolve a tarefa para o quadro do responsável, pendente e expandida
 * (auditoria humana, clique por engano ou God Mode). Vale para
 * "pending_validation" e "validated_done"; limpa só a marcação e, nas
 * agregadas, desmarca todos os clientes. Notas e histórico permanecem.
 */
export async function reverterTarefa(tarefa: Tarefa) {
  await updateDoc(doc(db, "tarefas", tarefa.id), { ...camposDeTarefaAtiva(), ...comClientes(tarefa, false) });
}

/** God Mode (Gerência): marca a tarefa como feita, com todos os clientes concluídos nas agregadas. */
export async function marcarFeitaPelaGerencia(tarefa: Tarefa, uid: string, autor?: string | null) {
  const agora = new Date().toISOString();
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: agora,
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
    notaResolucao: NOTA_GERENCIA,
    historicoNotas: arrayUnion(
      ...semente(tarefa.historicoNotas, tarefa.notaResolucao, tarefa.resolvidoEm),
      { texto: NOTA_GERENCIA, data: agora, autor: autor ?? null }
    ),
    ...comClientes(tarefa, true),
  });
}

async function chamarTarefa(metodo: "POST" | "PATCH" | "DELETE", url: string, idToken: string, corpo?: object) {
  // Timeout: uma requisição pendurada não pode deixar o modal travado em "enviando" para sempre.
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
    // Resposta que não é JSON (ex.: página de erro do servidor) não pode virar um "Unexpected token".
    const json = (await res.json().catch(() => null)) as { id?: string; erro?: string } | null;
    if (!res.ok) throw new Error(json?.erro ?? `Falha ao alterar a tarefa (HTTP ${res.status}).`);
    return (json ?? {}) as { id: string };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("O servidor demorou demais para responder. Tente novamente.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Cria uma tarefa avulsa (hierarquia de destinatários validada no servidor). dataLimite vazia = padrão. */
export function criarTarefaManual(descricao: string, atribuidoPara: Quadro, dataLimite: string, idToken: string) {
  return chamarTarefa("POST", "/api/tarefas", idToken, { descricao, atribuidoPara, dataLimite });
}

/** Edita texto, responsável e data limite (Gerência em qualquer tarefa; criador nas avulsas). */
export async function editarTarefa(
  id: string,
  campos: { descricao: string; atribuidoPara: Quadro; dataLimite: string },
  idToken: string
) {
  await chamarTarefa("PATCH", `/api/tarefas/${encodeURIComponent(id)}`, idToken, campos);
}

/** Exclusão definitiva (hard delete). */
export async function excluirTarefa(id: string, idToken: string) {
  await chamarTarefa("DELETE", `/api/tarefas/${encodeURIComponent(id)}`, idToken);
}
