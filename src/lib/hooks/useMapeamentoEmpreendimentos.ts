"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { DOC_MAPEAMENTO_EMPREENDIMENTOS } from "@/lib/services/mapeamentoEmpreendimentosService";
import type { MatrizEmpreendimentos } from "@/lib/auth/roles";

/** Matriz de Empreendimentos vigente (vínculos colaborador <-> empreendimento <-> etapas,
 * cadastrados pela Gerência) — lida em tempo real por qualquer tela que precise resolver "quem
 * cuida desta pasta" (cards, o próprio painel de config). Mesmo padrão de useMapeamentoPracas.ts. */
export function useMapeamentoEmpreendimentos() {
  const [overrides, setOverrides] = useState<MatrizEmpreendimentos>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      DOC_MAPEAMENTO_EMPREENDIMENTOS,
      (snap) => {
        setOverrides((snap.data()?.overrides as MatrizEmpreendimentos) ?? {});
        setLoading(false);
      },
      (err) => {
        console.error("[useMapeamentoEmpreendimentos] falha ao ler mapeamento:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { overrides, loading };
}
