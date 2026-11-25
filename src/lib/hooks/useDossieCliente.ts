"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { BaseDossie, DossieCompleto } from "@/lib/server/dossieCliente";

const BASE_VAZIA: BaseDossie = { pastas: [], etapas: {}, primeiraPlanilha: null, ultimaPlanilha: null };

/** Pastas e movimentações: carregadas uma vez ao abrir a tela; `recarregar` após uma falha. */
export function useBaseDossie(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [base, setBase] = useState<BaseDossie>(BASE_VAZIA);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!firebaseUser || !habilitado) return;
    setCarregando(true);
    setErro(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/dossie-cliente?lista=1", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao carregar os clientes (HTTP ${res.status}).`);
      setBase(json as BaseDossie);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, [firebaseUser, habilitado]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { ...base, carregando, erro, recarregar };
}

/** Dossiê de uma pasta: uma chamada por abertura (sem listener em tempo real). */
export function useDossieCliente() {
  const { firebaseUser } = useAuth();
  const [dossie, setDossie] = useState<DossieCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Só a consulta mais recente atualiza a tela (escolher outro cliente antes da resposta chegar).
  const pedido = useRef(0);

  const abrir = useCallback(
    async (numero: string) => {
      if (!firebaseUser) return;
      const meu = ++pedido.current;
      setLoading(true);
      setErro(null);
      setDossie(null);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/dossie-cliente?numero=${encodeURIComponent(numero)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao abrir o dossiê (HTTP ${res.status}).`);
        if (meu === pedido.current) setDossie(json as DossieCompleto);
      } catch (e) {
        if (meu === pedido.current) setErro(e instanceof Error ? e.message : "Falha ao abrir o dossiê.");
      } finally {
        if (meu === pedido.current) setLoading(false);
      }
    },
    [firebaseUser]
  );

  const limpar = useCallback(() => {
    pedido.current++;
    setLoading(false);
    setDossie(null);
    setErro(null);
  }, []);

  return { dossie, loading, erro, abrir, limpar };
}
