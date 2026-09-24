"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Assistente, QuadroEscalonamento, Tarefa } from "@/lib/types";

/** Tarefas ativas (visíveis em algum quadro) das praças informadas, mais recentes primeiro. */
export function useTarefasPorPracas(pracas: Assistente[]) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const pracasKey = pracas.slice().sort().join(",");

  useEffect(() => {
    if (pracas.length === 0) {
      setTarefas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const q = query(
      collection(db, "tarefas"),
      where("praca", "in", pracas),
      orderBy("criadoEm", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const todas = snap.docs.map(
          (d) => ({ id: d.id, escalonadoPara: [] as QuadroEscalonamento[], ...d.data() }) as Tarefa
        );
        setTarefas(todas.filter((t) => t.status !== "validated_done"));
        setLoading(false);
      },
      (err) => {
        console.error("[useTarefasPorPracas] falha ao ler tarefas:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pracasKey]);

  return { tarefas, loading, erro };
}
