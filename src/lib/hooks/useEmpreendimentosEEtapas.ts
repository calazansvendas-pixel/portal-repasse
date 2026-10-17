"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { codigoEtapa } from "@/lib/auth/roles";
import type { Registro } from "@/lib/types";

export interface EtapaExtraida {
  codigo: string; // ex.: "1.17"
  label: string; // ex.: "1.17 - Documentação incompleta"
}

/** Lista de empreendimentos e etapas EXISTENTES, extraída diretamente das pastas já importadas
 * (coleção "registros") — não há cadastro manual de nenhum dos dois; a Matriz de Empreendimentos
 * só vincula colaboradores a combinações que já apareceram de verdade na planilha. Lida uma única
 * vez por carregamento da tela (não em tempo real: a lista de produtos/etapas não muda o
 * suficiente, dentro de uma sessão de edição, para justificar o custo de um listener). */
export function useEmpreendimentosEEtapas() {
  const [produtos, setProdutos] = useState<string[]>([]);
  const [etapas, setEtapas] = useState<EtapaExtraida[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "registros"));
        const produtosSet = new Set<string>();
        const etapasPorCodigo = new Map<string, string>();
        snap.forEach((docSnap) => {
          const dados = docSnap.data() as Registro;
          const produto = dados.produto?.trim();
          if (produto) produtosSet.add(produto);
          const etapa = dados.etapa?.trim();
          if (etapa) {
            const codigo = codigoEtapa(etapa);
            if (!etapasPorCodigo.has(codigo)) etapasPorCodigo.set(codigo, etapa);
          }
        });
        if (cancelado) return;
        setProdutos([...produtosSet].sort((a, b) => a.localeCompare(b, "pt-BR")));
        setEtapas(
          [...etapasPorCodigo.entries()]
            .map(([codigo, label]) => ({ codigo, label }))
            .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
        );
      } catch (e) {
        console.error("[useEmpreendimentosEEtapas] falha ao extrair empreendimentos/etapas:", e);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { produtos, etapas, loading };
}
