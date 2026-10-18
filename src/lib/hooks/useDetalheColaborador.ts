"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { DetalheColaborador } from "@/lib/services/detalheColaborador";

/** Busca sob demanda o relatório individual; `uid` null = nenhum colaborador selecionado (sem chamada). */
export function useDetalheColaborador(uid: string | null, dias: number) {
  const { firebaseUser } = useAuth();
  const [resultado, setResultado] = useState<{ chave: string; detalhe?: DetalheColaborador; erro?: string } | null>(null);
  const chave = uid ? `${uid}::${dias}` : null;

  useEffect(() => {
    if (!firebaseUser || !uid || !chave) return;
    let cancelado = false;
    firebaseUser
      .getIdToken()
      .then((token) =>
        fetch(`/api/analytics/colaborador?uid=${encodeURIComponent(uid)}&dias=${dias}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao carregar o colaborador (HTTP ${res.status}).`);
        return json as DetalheColaborador;
      })
      .then((detalhe) => !cancelado && setResultado({ chave, detalhe }))
      .catch((e) =>
        !cancelado && setResultado({ chave, erro: e instanceof Error ? e.message : "Falha ao carregar o colaborador." })
      );
    return () => {
      cancelado = true;
    };
  }, [firebaseUser, uid, dias, chave]);

  const atual = resultado && resultado.chave === chave ? resultado : null;
  return { detalhe: atual?.detalhe ?? null, erro: atual?.erro ?? null, loading: !!chave && !atual };
}
