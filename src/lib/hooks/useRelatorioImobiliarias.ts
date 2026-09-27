"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { PastaRelatorio } from "@/lib/server/relatorioImobiliarias";

/** Uma chamada por abertura da tela (sem listener em tempo real): puramente leitura/consulta. */
export function useRelatorioImobiliarias(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [pastas, setPastas] = useState<PastaRelatorio[]>([]);
  const [parcial, setParcial] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !habilitado) return;
    let cancelado = false;
    setLoading(true);
    setErro(null);
    firebaseUser
      .getIdToken()
      .then((token) => fetch("/api/relatorio-imobiliarias", { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao carregar o relatório (HTTP ${res.status}).`);
        return json as { pastas: PastaRelatorio[]; parcial: number | null };
      })
      .then((json) => {
        if (cancelado) return;
        setPastas(json.pastas);
        setParcial(json.parcial);
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : "Falha ao carregar o relatório."))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [firebaseUser, habilitado]);

  return { pastas, parcial, loading, erro };
}
