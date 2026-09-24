"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Registro } from "@/lib/types";

export function useRegistros(max = 300) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "registros"), orderBy("atualizadoEm", "desc"), limit(max));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRegistros(snap.docs.map((d) => d.data() as Registro));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [max]);

  return { registros, loading };
}
