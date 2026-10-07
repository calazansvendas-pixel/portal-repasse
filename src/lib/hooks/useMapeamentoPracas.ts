"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { DOC_MAPEAMENTO_PRACAS } from "@/lib/services/mapeamentoPracasService";
import type { PracaOverrides } from "@/lib/auth/roles";

/** Mapeamento de praças vigente (substituições da Gerência) — lido em tempo real por qualquer
 * tela que precise resolver "quem atende esta cidade" (cards, Dossiê, o próprio painel de config). */
export function useMapeamentoPracas() {
  const [overrides, setOverrides] = useState<PracaOverrides>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      DOC_MAPEAMENTO_PRACAS,
      (snap) => {
        setOverrides((snap.data()?.overrides as PracaOverrides) ?? {});
        setLoading(false);
      },
      (err) => {
        console.error("[useMapeamentoPracas] falha ao ler mapeamento:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { overrides, loading };
}
