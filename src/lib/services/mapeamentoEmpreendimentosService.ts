"use client";

import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MatrizEmpreendimentos } from "@/lib/auth/roles";

export const DOC_MAPEAMENTO_EMPREENDIMENTOS = doc(db, "configuracoes", "mapeamentoEmpreendimentos");

/** Grava a Matriz de Empreendimentos (vínculo colaborador <-> empreendimento <-> etapas). Restrito
 * à Gerência — ver firestore.rules (mesma regra de `configuracoes/{docId}` do mapeamento de praças). */
export async function salvarMapeamentoEmpreendimentos(overrides: MatrizEmpreendimentos, uid: string) {
  await setDoc(DOC_MAPEAMENTO_EMPREENDIMENTOS, {
    overrides,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: uid,
  });
}
