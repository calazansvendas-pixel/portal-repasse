"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { QuadroEscalonamento, Tarefa } from "@/lib/types";

/** Todas as tarefas recentes (qualquer status), usadas para ranking de parceiros e mapa de treinamento. */
export function useTodasTarefas(max = 1000) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "tarefas"), orderBy("criadoEm", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTarefas(
          snap.docs.map(
            (d) => ({ id: d.id, escalonadoPara: [] as QuadroEscalonamento[], ...d.data() }) as Tarefa
          )
        );
        setLoading(false);
      },
      (err) => {
        console.error("[useTodasTarefas] falha ao ler tarefas:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [max]);

  return { tarefas, loading, erro };
}
