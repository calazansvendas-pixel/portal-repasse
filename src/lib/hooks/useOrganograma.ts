"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ChecklistPastaDoc, DadosOrganograma, EtapaOrganograma, Praca } from "@/lib/organograma/tipos";

/** Uma mudança de checklist: um item, a modalidade ou a chave de casal. */
export type MudancaChecklist = { item: string; valor: boolean | string } | { modalidadeId: string } | { casal: boolean };

/** Chamada autenticada às rotas do Organograma; devolve o JSON ou lança a mensagem do servidor. */
function useChamada() {
  const { firebaseUser } = useAuth();
  return useCallback(
    async (url: string, metodo: "GET" | "PUT" | "PATCH" = "GET", corpo?: unknown) => {
      if (!firebaseUser) throw new Error("Sessão encerrada.");
      const res = await fetch(url, {
        method: metodo,
        cache: "no-store",
        headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.erro ?? `Falha na solicitação (HTTP ${res.status}).`);
      return json;
    },
    [firebaseUser]
  );
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir.");

export function useOrganograma(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const chamar = useChamada();
  const [dados, setDados] = useState<DadosOrganograma | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!firebaseUser || !habilitado) return;
    setCarregando(true);
    try {
      setDados((await chamar("/api/organograma")) as DadosOrganograma);
      setErro(null);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [firebaseUser, habilitado, chamar]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  /** Salva e recarrega; devolve a mensagem de erro (ou null se deu certo). */
  const salvar = useCallback(
    async (corpo: { etapa: EtapaOrganograma } | { pracas: Praca[] }): Promise<string | null> => {
      try {
        await chamar("/api/organograma", "PUT", corpo);
        await recarregar();
        return null;
      } catch (e) {
        return mensagem(e);
      }
    },
    [chamar, recarregar]
  );

  const marcar = useCallback(
    async (numero: string, etapa: string, mudanca: MudancaChecklist): Promise<string | null> => {
      try {
        const { checklist } = (await chamar("/api/checklists", "PATCH", { numero, etapa, ...mudanca })) as { checklist: ChecklistPastaDoc };
        setDados((d) => (d ? { ...d, checklists: { ...d.checklists, [numero]: checklist } } : d));
        return null;
      } catch (e) {
        return mensagem(e);
      }
    },
    [chamar]
  );

  return { dados, carregando, erro, recarregar, salvar, marcar };
}

/** Checklists de uma pasta (Dossiê do Cliente). */
export function useChecklistPasta(numero: string) {
  const { firebaseUser } = useAuth();
  const chamar = useChamada();
  const [dados, setDados] = useState<{ etapas: EtapaOrganograma[]; pracas: Praca[]; checklist: ChecklistPastaDoc } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Resposta de uma pasta anterior não pode aparecer na atual.
  const atual = useRef(numero);
  atual.current = numero;

  useEffect(() => {
    if (!firebaseUser) return;
    setDados(null);
    setErro(null);
    chamar(`/api/checklists?numero=${encodeURIComponent(numero)}`)
      .then((json) => atual.current === numero && setDados(json))
      .catch((e) => atual.current === numero && setErro(mensagem(e)));
  }, [firebaseUser, numero, chamar]);

  const marcar = useCallback(
    async (etapa: string, mudanca: MudancaChecklist): Promise<string | null> => {
      try {
        const { checklist } = await chamar("/api/checklists", "PATCH", { numero, etapa, ...mudanca });
        if (atual.current === numero) setDados((d) => (d ? { ...d, checklist } : d));
        return null;
      } catch (e) {
        return mensagem(e);
      }
    },
    [numero, chamar]
  );

  return { dados, erro, marcar };
}
