"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { EvolucaoEtapas } from "@/lib/services/analiseEtapas";
import type { CruzamentoPendencia, RankingParceiro } from "@/lib/services/analiseParceiros";

export interface PainelAnalitico {
  dias: number;
  evolucao: EvolucaoEtapas;
  ranking: RankingParceiro[];
  mapa: CruzamentoPendencia[];
  totalTarefas: number;
}

/**
 * Uma chamada por abertura/troca de janela (sem listener em tempo real: nada de leituras contínuas).
 * `habilitado` evita disparar a consulta para quem não pode ver o painel.
 */
export function usePainelAnalitico(dias: number, habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [dados, setDados] = useState<PainelAnalitico | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !habilitado) return;
    let cancelado = false;
    setLoading(true);
    setErro(null);
    firebaseUser
      .getIdToken()
      .then((token) => fetch(`/api/analytics/painel?dias=${dias}`, { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao carregar analytics (HTTP ${res.status}).`);
        return json as PainelAnalitico;
      })
      .then((json) => !cancelado && setDados(json))
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : "Falha ao carregar analytics."))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [firebaseUser, dias, habilitado]);

  return { dados, loading, erro };
}
