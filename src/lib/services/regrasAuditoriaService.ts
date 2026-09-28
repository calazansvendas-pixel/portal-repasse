"use client";

import { addDoc, collection, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { NovaRegraAuditoria } from "@/lib/types/regrasAuditoria";

/** Cria uma regra do Motor de Regras Dinâmicas. Restrito à Gerência (ver firestore.rules). */
export async function criarRegraAuditoria(dados: NovaRegraAuditoria, uid: string) {
  const agora = new Date().toISOString();
  await addDoc(collection(db, "regras_auditoria"), {
    ...dados,
    criadoEm: agora,
    criadoPor: uid,
    atualizadoEm: agora,
  });
}

export async function atualizarRegraAuditoria(id: string, dados: Partial<NovaRegraAuditoria>) {
  await updateDoc(doc(db, "regras_auditoria", id), { ...dados, atualizadoEm: new Date().toISOString() });
}

/** Liga/desliga a regra sem apagar o cadastro (histórico de configuração preservado). */
export async function alternarRegraAtiva(id: string, ativo: boolean) {
  await atualizarRegraAuditoria(id, { ativo });
}

export async function excluirRegraAuditoria(id: string) {
  await deleteDoc(doc(db, "regras_auditoria", id));
}
