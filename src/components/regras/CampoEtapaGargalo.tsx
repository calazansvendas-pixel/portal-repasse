"use client";

import { useMemo } from "react";
import { codigoEtapa } from "@/lib/auth/roles";
import { useEmpreendimentosEEtapas, type EtapaExtraida } from "@/lib/hooks/useEmpreendimentosEEtapas";
import { useRegrasAuditoria } from "@/lib/hooks/useRegrasAuditoria";
import { ehFimDeEsteira } from "@/lib/services/taskRouter";
import { ETAPAS_OFICIAIS } from "@/lib/etapasOficiais";

/**
 * Dropdown "Etapa específica" da categoria Volume e Gargalos. As opções unem as etapas das pastas
 * importadas, a lista oficial do funil e as já usadas em regras, em ordem numérica do código. Fim de
 * esteira fica de fora (pasta concluída nunca conta como gargalo). O valor gravado é o código da
 * etapa ("5.04"); vazio = todas. É um componente à parte para as pastas só serem lidas quando a
 * categoria é esta.
 */
export function CampoEtapaGargalo({
  valor,
  onChange,
  etapaDoNome,
}: {
  valor: string;
  onChange: (etapa: string) => void;
  /** Prefixo numérico do nome da regra que o motor usa quando nenhuma etapa é escolhida; null = não há. */
  etapaDoNome: string | null;
}) {
  const { etapas: etapasDasPastas, loading } = useEmpreendimentosEEtapas();
  const { regras } = useRegrasAuditoria(true);
  const selecionada = codigoEtapa(valor);

  const opcoes = useMemo(() => {
    const porCodigo = new Map<string, string>();
    const incluir = ({ codigo, label }: EtapaExtraida) => {
      if (codigo && !porCodigo.has(codigo) && !ehFimDeEsteira(label)) porCodigo.set(codigo, label);
    };
    // As pastas vêm primeiro porque trazem o nome vigente da etapa; a lista oficial completa o que
    // não tem pasta hoje.
    etapasDasPastas.forEach(incluir);
    ETAPAS_OFICIAIS.forEach((label) => incluir({ codigo: codigoEtapa(label), label }));
    for (const r of regras) {
      const etapa = r.parametros.etapa?.trim();
      if (etapa) incluir({ codigo: codigoEtapa(etapa), label: etapa });
    }
    // A etapa já gravada nesta regra sempre aparece, mesmo sem nenhuma pasta nela hoje.
    if (selecionada && !porCodigo.has(selecionada)) porCodigo.set(selecionada, selecionada);
    return [...porCodigo.entries()]
      .map(([codigo, label]) => ({ codigo, label }))
      // Pelo valor do código: 2.05, 2.051, 2.08.
      .sort((a, b) => parseFloat(a.codigo) - parseFloat(b.codigo) || a.codigo.localeCompare(b.codigo));
  }, [etapasDasPastas, regras, selecionada]);

  return (
    <label className="flex flex-col gap-1.5 sm:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Etapa específica (opcional)</span>
      <select className="input-field" value={selecionada} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas as etapas (monitorar funil completo)</option>
        {opcoes.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.label}
          </option>
        ))}
      </select>
      {loading && <span className="text-[11px] text-ink-muted">Carregando etapas das pastas…</span>}
      {!selecionada && etapaDoNome && (
        <span className="text-[11px] text-ink-muted">
          Atenção: como o nome da regra começa com {etapaDoNome}, sem escolher uma etapa ela monitora só a{" "}
          {etapaDoNome}.
        </span>
      )}
    </label>
  );
}
