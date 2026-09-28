"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { RegraAuditoria } from "@/lib/types/regrasAuditoria";

/** Todas as regras do Motor de Regras Dinâmicas, mais recentes primeiro. */
export function useRegrasAuditoria(habilitado: boolean) {
  const [regras, setRegras] = useState<RegraAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!habilitado) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    const q = query(collection(db, "regras_auditoria"), orderBy("criadoEm", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRegras(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraAuditoria));
        setLoading(false);
      },
      (err) => {
        console.error("[useRegrasAuditoria] falha ao ler regras:", err);
        setErro(err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [habilitado]);

  return { regras, loading, erro };
}
