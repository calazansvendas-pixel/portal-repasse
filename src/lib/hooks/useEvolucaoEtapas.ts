"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { EvolucaoEtapas } from "@/lib/services/analiseEtapas";

export function useEvolucaoEtapas() {
  const { firebaseUser } = useAuth();
  const [dados, setDados] = useState<EvolucaoEtapas | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    let cancelado = false;
    setLoading(true);
    firebaseUser
      .getIdToken()
      .then((token) => fetch("/api/analytics/etapas", { headers: { Authorization: `Bearer ${token}` } }))
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return;
        if (json.erro) setErro(json.erro);
        else setDados(json as EvolucaoEtapas);
      })
      .catch(() => !cancelado && setErro("Falha ao carregar analytics."))
      .finally(() => !cancelado && setLoading(false));

    return () => {
      cancelado = true;
    };
  }, [firebaseUser]);

  return { dados, loading, erro };
}
