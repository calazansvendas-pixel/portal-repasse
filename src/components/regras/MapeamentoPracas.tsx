"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { CIDADES_FILTRO, type PracaOverrides } from "@/lib/auth/roles";
import { useMapeamentoPracas } from "@/lib/hooks/useMapeamentoPracas";
import { salvarMapeamentoPracas } from "@/lib/services/mapeamentoPracasService";
import { ASSISTENTE_LABEL } from "@/lib/types";
import type { Assistente } from "@/lib/types";

const ASSISTENTES: Assistente[] = ["laiza", "eliane", "catarina"];
const AUTOMATICO = "";

/**
 * Permite à Gerência substituir, por cidade, o vínculo padrão de praça (ex.: Serra deixa de ir
 * automaticamente para a Layza e passa a ir sempre para a Eliane) — sem editar código. "Automático"
 * mantém o mapeamento padrão (CIDADES_FILTRO); a mudança vale a partir da PRÓXIMA importação.
 */
export function MapeamentoPracas() {
  const { firebaseUser } = useAuth();
  const { overrides, loading } = useMapeamentoPracas();
  const [rascunho, setRascunho] = useState<PracaOverrides>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O rascunho local só nasce do Firestore uma vez (quando carrega) — depois disso o usuário edita
  // livremente sem o listener em tempo real sobrescrever o que ele ainda não salvou.
  useEffect(() => {
    if (!loading) setRascunho(overrides);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    if (!firebaseUser) return;
    setSalvando(true);
    setErro(null);
    try {
      // Firestore rejeita `undefined`: "Automático" precisa remover a chave, nunca gravá-la vazia.
      const limpo = Object.fromEntries(Object.entries(rascunho).filter(([, v]) => v !== undefined));
      await salvarMapeamentoPracas(limpo, firebaseUser.uid);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o mapeamento.");
    } finally {
      setSalvando(false);
    }
  }

  const alterado = JSON.stringify(rascunho) !== JSON.stringify(overrides);

  return (
    <div className="surface-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-brand-primary" />
        <h2 className="text-sm font-bold text-ink-primary dark:text-white">Mapeamento de Praças</h2>
      </div>
      <p className="text-xs text-ink-secondary dark:text-white/60">
        Por padrão, cada cidade cai automaticamente na praça de sempre. Para abrir uma exceção (ex.: a Eliane cobrindo
        Serra), escolha o colaborador aqui — vale a partir da próxima importação, em todas as regras com destino
        &quot;Assistente&quot;.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CIDADES_FILTRO.map((c) => (
          <label key={c.chave} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{c.label}</span>
            <select
              className="input-field"
              value={rascunho[c.chave] ?? AUTOMATICO}
              onChange={(e) =>
                setRascunho((r) => ({ ...r, [c.chave]: (e.target.value || undefined) as Assistente | undefined }))
              }
            >
              <option value={AUTOMATICO}>Automático ({ASSISTENTE_LABEL[c.praca].split(" (")[0]})</option>
              {ASSISTENTES.map((a) => (
                <option key={a} value={a}>
                  {ASSISTENTE_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {erro && <p className="text-xs text-status-danger">{erro}</p>}

      <div className="flex items-center justify-end gap-3">
        {alterado && <span className="text-[11px] text-status-warning">Alterações não salvas</span>}
        <button type="button" className="btn-primary h-10" onClick={salvar} disabled={!alterado || salvando}>
          {salvando ? "Salvando…" : "Salvar Mapeamento"}
        </button>
      </div>
    </div>
  );
}
