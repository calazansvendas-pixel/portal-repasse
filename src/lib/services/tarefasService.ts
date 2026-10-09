"use client";

import { arrayUnion, doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ClienteEnvolvido, NotaResolucao, Quadro, Role, Tarefa } from "@/lib/types";

/** Destino de um override manual de responsável — null = voltar para "Automático". */
export interface DestinoResponsavelCustomizado {
  uid: string;
  nome: string;
  quadro: Quadro;
}

/** Rótulo usado só na mensagem padrão de conclusão — "pela Coordenação"/"pela Gerência" leem
 * melhor que os rótulos de menu (ROLE_LABEL). */
const CARGO_MENSAGEM: Record<Role, string> = {
  assistente: "Assistente",
  analista: "Analista",
  coordenador: "Coordenação",
  gerencia: "Gerência",
};

/**
 * Todo mundo que marca uma tarefa como feita — Assistente, Analista, Coordenador ou Gerência —
 * deixa um registro no histórico, mesmo sem escrever nada: a nota digitada vence quando existe;
 * sem nota, entra esta mensagem padrão, para o card "O que foi feito" nunca ficar vazio.
 */
function mensagemPadraoOuNota(nota: string, cargo: Role | null | undefined): string {
  if (nota) return nota;
  return cargo ? `Marcada como feita pela ${CARGO_MENSAGEM[cargo]}.` : "Marcada como feita.";
}

/** A nota "O que foi feito" é OPCIONAL: aceita vazio/undefined sem bloquear a conclusão. */
function normalizarNota(nota: string | undefined): string {
  return (nota ?? "").trim();
}

/** Notas antigas (anteriores ao histórico) viram a primeira entrada, para nunca se perderem. */
function semente(historico: NotaResolucao[] | undefined, notaLegada: string | null | undefined, data: string | null | undefined) {
  return !historico?.length && notaLegada ? [{ texto: notaLegada, data: data ?? "", autor: null }] : [];
}

/** Lembrete Programado, definido junto com a nota de conclusão (ver NotaConclusaoModal). */
export interface LembreteInput {
  data: string; // yyyy-MM-dd
  mensagem: string;
}

/** Campos do lembrete para a escrita no Firestore: grava o novo lembrete quando informado, ou
 * desativa o anterior — ele já cumpriu o papel de reabrir a tarefa até aqui. */
function camposLembrete(lembrete: LembreteInput | null | undefined, autor: string | null | undefined) {
  return lembrete
    ? {
        lembreteAtivo: true,
        lembreteData: lembrete.data,
        lembreteMensagem: lembrete.mensagem,
        lembreteDefinidoPor: autor ?? null,
      }
    : { lembreteAtivo: false };
}

/** Edita a data/mensagem de um lembrete já existente (lápis no banner/detalhes) — não toca em
 * mais nenhum campo da tarefa (histórico, resolução, etc. ficam intactos). */
export async function atualizarLembrete(tarefaId: string, lembrete: LembreteInput, autor: string | null) {
  await updateDoc(doc(db, "tarefas", tarefaId), {
    lembreteAtivo: true,
    lembreteData: lembrete.data,
    lembreteMensagem: lembrete.mensagem,
    lembreteDefinidoPor: autor ?? null,
  });
}

/** Desativa e limpa o lembrete (lixeira) — a tarefa deixa de ser reaberta por ele, mas o
 * status/histórico/resolução continuam exatamente como estavam. */
export async function removerLembrete(tarefaId: string) {
  await updateDoc(doc(db, "tarefas", tarefaId), {
    lembreteAtivo: false,
    lembreteData: null,
    lembreteMensagem: null,
    lembreteDefinidoPor: null,
  });
}

/**
 * Assistente, Analista ou Coordenador marca a tarefa como resolvida. A nota "O que foi feito" é
 * OPCIONAL: se vier vazia, entra a mensagem padrão ("Marcada como feita pela Assistente.", etc.) —
 * assim o card "O que foi feito" nunca fica vazio, não importa quem concluiu. Isso NÃO fecha a
 * tarefa definitivamente: ela vai para "pending_validation" até a próxima importação de planilha
 * confirmar (ou não) o avanço da etapa — ver auditEngine.ts.
 */
export async function marcarTarefaResolvida(
  tarefa: Tarefa,
  uid: string,
  nota: string,
  autor?: string | null,
  cargo?: Role | null,
  lembrete?: LembreteInput | null
) {
  const notaDigitada = normalizarNota(nota);
  const texto = mensagemPadraoOuNota(notaDigitada, cargo);
  const agora = new Date().toISOString();
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: agora,
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
    notaResolucao: notaDigitada || tarefa.notaResolucao || null,
    historicoNotas: arrayUnion(
      ...semente(tarefa.historicoNotas, tarefa.notaResolucao, tarefa.resolvidoEm),
      { texto, data: agora, autor: autor ?? null }
    ),
    ...camposLembrete(lembrete, autor),
  });
}

/**
 * Marca/desmarca UM cliente dentro de uma tarefa agregada (gargalo). A tarefa
 * mãe só entra em "pending_validation" quando todos os clientes estão
 * marcados; desmarcar qualquer um a devolve para "pendente".
 * Concluir com `nota` (modal do cliente) sempre grava uma entrada no histórico do cliente — a nota
 * digitada quando existe, ou a mensagem padrão de conclusão quando fica em branco (mesma
 * padronização de marcarTarefaResolvida). Sem `nota` (check rápido da lista, fora do modal) nada
 * do histórico muda; desmarcar NUNCA apaga notas.
 */
export async function alternarClienteEnvolvido(
  tarefaId: string,
  numero: string,
  uid: string,
  nota?: string,
  autor?: string | null,
  cargo?: Role | null
) {
  const ref = doc(db, "tarefas", tarefaId);
  const texto = nota === undefined ? undefined : mensagemPadraoOuNota(normalizarNota(nota), cargo);
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
  const texto = mensagemPadraoOuNota("", "gerencia");
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
    ...comClientes(tarefa, true),
  });
}

/**
 * Override manual de responsável no CARTÃO (Gerência): prevalece sobre o Mapeamento de Praças
 * global e sobre a resolução padrão por cidade/regra (ver resolvePracaPorCidade/auditEngine.ts).
 * Define → trava `praca` nesse quadro imediatamente (o card já troca de coluna) e sobrevive a
 * importações futuras. Volta para "Automático" (destino null) → limpa o override; a importação
 * seguinte realinha `praca` pelo mapeamento/regra padrão, assim como qualquer outra mudança de
 * roteamento configurada neste app.
 */
export async function definirResponsavelCustomizado(
  tarefa: Tarefa,
  destino: DestinoResponsavelCustomizado | null,
  autor: string | null
) {
  const agora = new Date().toISOString();
  const texto = destino
    ? `Responsável alterado manualmente para ${destino.nome} por ${autor ?? "Gerência"}.`
    : "Responsável voltado para Automático (mapeamento padrão de praça).";
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    pracaCustomizada: destino?.quadro ?? null,
    responsavelCustomizadoId: destino?.uid ?? null,
    responsavelCustomizadoNome: destino?.nome ?? null,
    ...(destino ? { praca: destino.quadro } : {}),
    atualizadoEm: agora,
    historicoNotas: arrayUnion(
      ...semente(tarefa.historicoNotas, tarefa.notaResolucao, tarefa.resolvidoEm),
      { texto, data: agora, autor: autor ?? null }
    ),
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
