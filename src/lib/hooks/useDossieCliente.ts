"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { CandidatoDossie, DossieCompleto } from "@/lib/server/dossieCliente";
import type { ClienteDossie } from "@/lib/utils/buscaClientes";

/** Clientes do campo pesquisável: carregados uma vez ao abrir a tela; `recarregar` após uma falha. */
export function useListaClientes(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [clientes, setClientes] = useState<ClienteDossie[]>([]);
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
      setClientes((json as { clientes: ClienteDossie[] }).clientes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, [firebaseUser, habilitado]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { clientes, carregando, erro, recarregar };
}

/** Uma chamada por busca/abertura (sem listener em tempo real): puramente leitura/consulta. */
export function useDossieCliente() {
  const { firebaseUser } = useAuth();
  const [candidatos, setCandidatos] = useState<CandidatoDossie[]>([]);
  const [dossie, setDossie] = useState<DossieCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Só a consulta mais recente atualiza a tela (escolher outro cliente antes da resposta chegar).
  const pedido = useRef(0);

  const buscar = useCallback(
    async (termo: string) => {
      if (!firebaseUser) return;
      const meu = ++pedido.current;
      setLoading(true);
      setErro(null);
      setDossie(null);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/dossie-cliente?termo=${encodeURIComponent(termo)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha na busca (HTTP ${res.status}).`);
        if (meu === pedido.current) setCandidatos((json as { candidatos: CandidatoDossie[] }).candidatos ?? []);
      } catch (e) {
        if (meu !== pedido.current) return;
        setErro(e instanceof Error ? e.message : "Falha na busca.");
        setCandidatos([]);
      } finally {
        if (meu === pedido.current) setLoading(false);
      }
    },
    [firebaseUser]
  );

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
        if (meu !== pedido.current) return;
        setDossie(json as DossieCompleto);
        setCandidatos([]);
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
    setCandidatos([]);
    setErro(null);
  }, []);

  return { candidatos, dossie, loading, erro, buscar, abrir, limpar };
}
