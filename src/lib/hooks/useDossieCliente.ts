"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { CandidatoDossie, DossieCompleto } from "@/lib/server/dossieCliente";

/** Uma chamada por busca/abertura (sem listener em tempo real): puramente leitura/consulta. */
export function useDossieCliente() {
  const { firebaseUser } = useAuth();
  const [candidatos, setCandidatos] = useState<CandidatoDossie[]>([]);
  const [dossie, setDossie] = useState<DossieCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (termo: string) => {
      if (!firebaseUser) return;
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
        setCandidatos((json as { candidatos: CandidatoDossie[] }).candidatos ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na busca.");
        setCandidatos([]);
      } finally {
        setLoading(false);
      }
    },
    [firebaseUser]
  );

  const abrir = useCallback(
    async (numero: string) => {
      if (!firebaseUser) return;
      setLoading(true);
      setErro(null);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/dossie-cliente?numero=${encodeURIComponent(numero)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) throw new Error(json?.erro ?? `Falha ao abrir o dossiê (HTTP ${res.status}).`);
        setDossie(json as DossieCompleto);
        setCandidatos([]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao abrir o dossiê.");
      } finally {
        setLoading(false);
      }
    },
    [firebaseUser]
  );

  const limpar = useCallback(() => {
    setDossie(null);
    setCandidatos([]);
    setErro(null);
  }, []);

  return { candidatos, dossie, loading, erro, buscar, abrir, limpar };
}
