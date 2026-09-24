"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Tarefa } from "@/lib/types";

/** Todas as tarefas recentes (qualquer status), usadas para ranking de parceiros e mapa de treinamento. */
export function useTodasTarefas(max = 1000) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "tarefas"), orderBy("criadoEm", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTarefas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tarefa));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [max]);

  return { tarefas, loading };
}
