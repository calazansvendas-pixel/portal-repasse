"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Registro } from "@/lib/types";

/**
 * `pausado`: desconecta o listener (sem apagar os dados já carregados) enquanto uma importação
 * está em andamento. A query ordena por `atualizadoEm desc` e a auditoria atualiza esse campo em
 * TODA pasta tocada pela planilha — com o listener ligado, cada lote de escrita do import
 * reordena a janela dos 300 mais recentes e reconta como novas leituras cobradas no plano Blaze.
 * Ao religar (`pausado` volta a false), assina de novo e sincroniza em UMA leitura só.
 */
export function useRegistros(max = 300, pausado = false) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (pausado) return;
    const q = query(collection(db, "registros"), orderBy("atualizadoEm", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRegistros(snap.docs.map((d) => d.data() as Registro));
        setLoading(false);
      },
      (err) => {
        console.error("[useRegistros] falha ao ler registros:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [max, pausado]);

  return { registros, loading, erro };
}
