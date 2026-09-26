"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { EtapaHistorico, Quadro, QuadroEscalonamento, Tarefa } from "@/lib/types";
import { normalizarTarefa } from "@/lib/utils/normalizarTarefa";

const STATUS_ATIVOS: Tarefa["status"][] = ["pendente", "pending_validation", "audit_failed"];

/**
 * Tarefas ativas dos quadros informados, mais recentes primeiro. `quadros`
 * deve ser a união das praças regionais visíveis + os quadros nativos de
 * Coordenador/Analista (ver roles.quadrosParaBuscar) — o campo Firestore
 * continua se chamando "praca" por compatibilidade com o índice já publicado,
 * mas aceita qualquer Quadro (regional, coordenador ou analista).
 */
export function useTarefasPorQuadros(quadros: Quadro[]) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const quadrosKey = quadros.slice().sort().join(",");

  useEffect(() => {
    if (quadros.length === 0) {
      setTarefas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const q = query(
      collection(db, "tarefas"),
      where("praca", "in", quadros),
      // Filtra no servidor: tarefas já validadas (validated_done) nunca são baixadas.
      where("status", "in", STATUS_ATIVOS),
      orderBy("criadoEm", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const todas = snap.docs.map((d) => {
          const raw = {
            id: d.id,
            escalonadoPara: [] as QuadroEscalonamento[],
            historicoEtapas: [] as EtapaHistorico[],
            ...d.data(),
          } as Tarefa;
          return normalizarTarefa(raw);
        });
        setTarefas(todas);
        setLoading(false);
      },
      (err) => {
        console.error("[useTarefasPorQuadros] falha ao ler tarefas:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadrosKey]);

  return { tarefas, loading, erro };
}
