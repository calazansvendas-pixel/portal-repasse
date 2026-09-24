"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Importacao } from "@/lib/types";

export function useImportacoes(max = 30) {
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "importacoes"), orderBy("id", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setImportacoes(snap.docs.map((d) => d.data() as Importacao));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [max]);

  return { importacoes, loading };
}
