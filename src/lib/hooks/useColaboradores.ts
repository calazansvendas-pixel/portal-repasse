"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Colaborador } from "@/app/api/colaboradores/route";

/** Lista de colaboradores ativos para o seletor de "destino fixo" do Motor de Regras (Gerência). */
export function useColaboradores(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !habilitado) return;
    let cancelado = false;
    setLoading(true);
    setErro(null);
    firebaseUser
      .getIdToken()
      .then((token) => fetch("/api/colaboradores", { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao carregar colaboradores (HTTP ${res.status}).`);
        return json as { colaboradores: Colaborador[] };
      })
      .then((json) => {
        if (cancelado) return;
        setColaboradores(json.colaboradores);
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : "Falha ao carregar colaboradores."))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [firebaseUser, habilitado]);

  return { colaboradores, loading, erro };
}
