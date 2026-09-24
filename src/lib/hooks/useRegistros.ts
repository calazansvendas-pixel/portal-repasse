"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Registro } from "@/lib/types";

export function useRegistros(max = 300) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
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
  }, [max]);

  return { registros, loading, erro };
}
