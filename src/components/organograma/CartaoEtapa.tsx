"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Users } from "lucide-react";
import { responsavelDoPapel, type Metricas } from "@/lib/organograma/calculo";
import type { Descoberta } from "@/lib/organograma/calculo";
import type { EtapaOrganograma, Papel, Praca } from "@/lib/organograma/tipos";
import { Botao } from "@/components/admin/ui";
import { cn } from "@/lib/utils/cn";

const SAIDAS_VISIVEIS = 3;

export const pastas = (n: number) => `${n} pasta${n === 1 ? "" : "s"}`;

/** Nomes do papel: os de uma praça escolhida ou o resumo por praça. */
function Responsavel({ papel, praca, pracas }: { papel: Papel; praca: string; pracas: Praca[] }) {
  if (praca) {
    const nome = responsavelDoPapel(papel, praca);
    return <span className={cn(!nome && "text-status-danger")}>{nome || "sem responsável"}</span>;
  }
  const especificos = pracas.filter((p) => papel.porPraca[p.id]?.trim());
  if (!especificos.length) {
    return <span className={cn(!papel.todas && "text-status-danger")}>{papel.todas || "sem responsável"}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {papel.todas && <span className="mr-1">{papel.todas}</span>}
      {especificos.map((p) => (
        <span key={p.id} className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-900">
          {p.nome}: <b>{papel.porPraca[p.id]}</b>
        </span>
      ))}
    </span>
  );
}

export function CartaoEtapa({
  etapa,
  nomePlanilha,
  metricas,
  descoberta,
  aConferir,
  praca,
  pracas,
  nomeDaPraca,
  rotuloEtapa,
  onVerPastas,
  onEditar,
}: {
  etapa: EtapaOrganograma;
  nomePlanilha: string | undefined;
  metricas: Metricas | undefined;
  descoberta: Descoberta | undefined;
  /** Pastas paradas com o checklist incompleto, quando a etapa pede conferência na entrada. */
  aConferir: number;
  praca: string;
  pracas: Praca[];
  nomeDaPraca: (id: string) => string;
  rotuloEtapa: (codigo: string) => string;
  onVerPastas: () => void;
  /** Ausente para quem só consulta. */
  onEditar?: () => void;
}) {
  const [todasSaidas, setTodasSaidas] = useState(false);
  const m = metricas ?? { entraram: 0, paradas: 0, acimaDoPrazo: 0, saidas: [], porPraca: {} };
  const saidas = todasSaidas ? m.saidas : m.saidas.slice(0, SAIDAS_VISIVEIS);
  const numeros = [
    { rotulo: "Entraram", valor: m.entraram },
    { rotulo: "Paradas hoje", valor: m.paradas },
    ...(etapa.slaDias != null ? [{ rotulo: `${etapa.slaDias}+ dias`, valor: m.acimaDoPrazo, alerta: m.acimaDoPrazo > 0 }] : []),
  ];

  return (
    <article
      data-etapa={etapa.codigo}
      className={cn("surface-card flex min-w-0 flex-col gap-3 p-4", etapa.alerta && "!border-status-danger/50 border-l-4")}
    >
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-brand-primary px-2 py-0.5 font-display text-sm font-bold tabular-nums text-white">{etapa.codigo}</span>
          {etapa.selos.map((s) => (
            <span
              key={s}
              className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", etapa.alerta ? "bg-status-danger/10 text-status-danger" : "bg-brand-100 text-brand-900")}
            >
              {s}
            </span>
          ))}
        </div>
        <h3 className="mt-1.5 break-words text-sm font-bold text-ink-primary dark:text-white">{etapa.nome}</h3>
        {nomePlanilha && <p className="break-words text-[11px] text-ink-muted">Na planilha: {nomePlanilha}</p>}
      </header>

      {descoberta && (
        <p className="flex items-start gap-1.5 rounded-md border border-status-danger/30 bg-status-danger/10 px-2.5 py-2 text-xs font-semibold text-status-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {descoberta.pracas ? `Etapa sem responsável definido em: ${descoberta.pracas.map(nomeDaPraca).join(", ")}` : "Etapa sem responsável definido"}
        </p>
      )}

      <dl className={cn("grid gap-2", numeros.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {numeros.map((n) => (
          <div key={n.rotulo} className={cn("rounded-md border border-border px-2 py-1.5 dark:border-white/10", n.alerta && "!border-status-danger/40 bg-status-danger/10")}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{n.rotulo}</dt>
            <dd className={cn("font-display text-xl font-bold tabular-nums text-brand-primary dark:text-white", n.alerta && "!text-status-danger")}>{n.valor}</dd>
          </div>
        ))}
      </dl>

      {etapa.conferirNaEntrada && aConferir > 0 && (
        <button type="button" onClick={onVerPastas} className="rounded-md border border-status-danger/30 bg-status-danger/10 px-2.5 py-2 text-left text-xs font-semibold text-status-danger">
          Alerta: {pastas(aConferir)} aguardando a conferência de entrada
        </button>
      )}

      {etapa.papeis.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {etapa.papeis.map((p) => (
            <li key={p.id} className="text-xs text-ink-primary dark:text-white">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{p.rotulo}</span>
              <span className="font-semibold">
                <Responsavel papel={p} praca={praca} pracas={pracas} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {etapa.funcao && <p className="break-words text-xs text-ink-secondary dark:text-white/70">{etapa.funcao}</p>}
      {etapa.fluxoEsperado && (
        <p className="break-words text-xs text-ink-secondary dark:text-white/70">
          <b>Fluxo esperado:</b> {etapa.fluxoEsperado}
        </p>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Fluxo real de saída (planilhas)</p>
        {m.saidas.length === 0 ? (
          <p className="text-xs text-ink-muted">Nenhuma saída registrada.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-primary dark:text-white">
            {saidas.map((s) => (
              <li key={s.para} className="flex items-baseline justify-between gap-2" title={rotuloEtapa(s.para)}>
                <span className="tabular-nums">
                  {etapa.codigo} → {s.para}
                </span>
                <span className="shrink-0 text-ink-muted">{pastas(s.pastas)}</span>
              </li>
            ))}
          </ul>
        )}
        {m.saidas.length > SAIDAS_VISIVEIS && (
          <button type="button" className="mt-1 text-xs font-bold text-brand-primary hover:underline dark:text-white" onClick={() => setTodasSaidas((v) => !v)}>
            {todasSaidas ? "Ver menos" : `Ver todas (+${m.saidas.length - SAIDAS_VISIVEIS})`}
          </button>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3 dark:border-white/10">
        <Botao tom="verde" disabled={!m.paradas} onClick={onVerPastas}>
          <Users size={14} /> {etapa.modalidades.length ? "Pastas e checklist" : "Pastas"} ({m.paradas})
        </Botao>
        {onEditar && (
          <Botao tom="editar" onClick={onEditar}>
            <Pencil size={14} /> Editar
          </Botao>
        )}
      </div>
    </article>
  );
}
