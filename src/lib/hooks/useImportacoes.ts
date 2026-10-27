"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Importacao } from "@/lib/types";

/** `pausado`: mesmo motivo do useRegistros — desliga o listener durante a importação em
 * andamento e reassina (uma única leitura de sincronização) quando ela termina. */
export function useImportacoes(max = 30, pausado = false) {
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (pausado) return;
    const q = query(collection(db, "importacoes"), orderBy("id", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setImportacoes(snap.docs.map((d) => d.data() as Importacao));
        setLoading(false);
      },
      (err) => {
        console.error("[useImportacoes] falha ao ler importações:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [max, pausado]);

  return { importacoes, loading, erro };
}
