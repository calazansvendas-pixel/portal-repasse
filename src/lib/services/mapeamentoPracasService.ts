"use client";

import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { PracaOverrides } from "@/lib/auth/roles";

export const DOC_MAPEAMENTO_PRACAS = doc(db, "configuracoes", "mapeamentoPracas");

/** Grava o mapeamento de praças (substituições explícitas). Restrito à Gerência — ver firestore.rules. */
export async function salvarMapeamentoPracas(overrides: PracaOverrides, uid: string) {
  await setDoc(DOC_MAPEAMENTO_PRACAS, {
    overrides,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: uid,
  });
}
