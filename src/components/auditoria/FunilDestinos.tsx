"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, FileSpreadsheet } from "lucide-react";
import {
  SEM_SELECAO,
  contagemClientes,
  formatarPercentual,
  fraseSelecao,
  type Dimensao,
  type Funil,
  type Selecao,
} from "@/lib/utils/funilDestinos";
import { cn } from "@/lib/utils/cn";

// Duas linhas de chips: 1 coluna no celular, 2 no tablet e 3 no computador.
function visibilidade(indice: number): string {
  if (indice < 2) return "flex";
  if (indice < 4) return "hidden sm:flex";
  if (indice < 6) return "hidden lg:flex";
  return "hidden";
}

const SELETORES: { dim: Dimensao; rotulo: string; todas: string }[] = [
  { dim: "origem", rotulo: "Consultar origem específica", todas: "Todas as etapas de origem" },
  { dim: "destino", rotulo: "Consultar destino específico", todas: "Todas as etapas de destino" },
];

const VISOES: { dim: Dimensao; rotulo: string }[] = [
  { dim: "destino", rotulo: "Por Etapa de Destino" },
  { dim: "origem", rotulo: "Por Etapa de Origem" },
];

const BOTAO = "btn-secondary !h-9 flex-1 !gap-1.5 whitespace-nowrap !px-3 !text-xs sm:flex-none";

/** Card recolhível com a distribuição do recorte filtrado e os seletores de origem e destino. */
export function FunilDestinos({
  funil,
  selecao,
  onSelecionar,
  onVisao,
  recolhido,
  onRecolher,
  onCopiar,
  onExportar,
}: {
  funil: Funil;
  selecao: Selecao;
  onSelecionar: (nova: Selecao) => void;
  onVisao: (visao: Dimensao) => void;
  recolhido: boolean;
  onRecolher: () => void;
  onCopiar: () => Promise<void>;
  /** Ausente quando o usuário não tem a permissão de exportar relatórios. */
  onExportar?: () => Promise<void>;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const { visao, chips } = funil;
  const destaque = fraseSelecao(funil, selecao);
  const total = chips.length;

  async function copiar() {
    setFalha(null);
    try {
      await onCopiar();
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalha("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
    }
  }

  async function exportar() {
    if (!onExportar) return;
    setFalha(null);
    setExportando(true);
    try {
      await onExportar();
    } catch {
      setFalha("Não foi possível gerar a planilha. Tente novamente.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <section data-funil className="surface-card flex flex-col gap-3 p-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onRecolher} aria-expanded={!recolhido} className="flex min-w-0 flex-1 basis-72 items-start gap-2 text-left">
          <ChevronDown size={18} className={cn("mt-0.5 shrink-0 text-brand-primary transition-transform", recolhido && "-rotate-90")} />
          <span className="min-w-0">
            <span role="heading" aria-level={2} className="block text-sm font-bold text-ink-primary dark:text-white">
              Resumo de Movimentação e Conversão (Funil de Destinos)
            </span>
            <span className="mt-0.5 block break-words text-xs text-ink-secondary dark:text-white/60">{funil.subtitulo}</span>
          </span>
        </button>
        <div className="flex w-full gap-2 sm:w-auto">
          <button type="button" className={BOTAO} onClick={copiar}>
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            <span aria-live="polite">{copiado ? "Copiado!" : "Copiar Resumo"}</span>
          </button>
          {onExportar && (
            <button type="button" className={BOTAO} onClick={exportar} disabled={exportando}>
              <FileSpreadsheet size={14} />
              {exportando ? "Gerando…" : "Exportar Relatório"}
            </button>
          )}
        </div>
      </div>

      {falha && <p className="text-xs text-status-danger">{falha}</p>}

      {!recolhido && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SELETORES.map(({ dim, rotulo, todas }) => (
            <label key={dim} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{rotulo}</span>
              <select
                data-seletor={dim}
                className="input-field !h-10 min-w-0"
                value={selecao[dim]}
                onChange={(e) => onSelecionar({ ...selecao, [dim]: e.target.value })}
              >
                <option value="">{todas}</option>
                {funil.opcoes[dim].map((g) => (
                  <option key={g.chave} value={g.chave}>
                    {g.nome} ({g.clientes})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {destaque && (
        <div data-destaque className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-primary/30 bg-brand-50 px-3 py-2 dark:bg-white/5">
          <p className="min-w-0 break-words text-sm font-semibold text-brand-primary dark:text-white">{destaque}</p>
          <button type="button" className="text-xs font-bold text-brand-primary underline underline-offset-2 dark:text-white" onClick={() => onSelecionar(SEM_SELECAO)}>
            Mostrar todos
          </button>
        </div>
      )}

      {!recolhido && (
        <>
          <div role="group" aria-label="Visão dos blocos" className="flex w-full rounded-md border border-border p-0.5 sm:w-auto sm:self-start dark:border-white/15">
            {VISOES.map(({ dim, rotulo }) => (
              <button
                key={dim}
                type="button"
                aria-pressed={visao === dim}
                onClick={() => {
                  setVerTodas(false);
                  onVisao(dim);
                }}
                className={cn(
                  "min-h-[32px] flex-1 rounded-[6px] px-3 text-xs font-semibold transition-colors sm:flex-none",
                  visao === dim ? "bg-brand-primary text-white" : "text-ink-secondary hover:text-brand-primary dark:text-white/70"
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chips.map((g, i) => {
              const ligado = g.chave === selecao[visao];
              return (
                <li key={g.chave} className={cn("min-w-0", verTodas ? "flex" : visibilidade(i))}>
                  <button
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => onSelecionar({ ...selecao, [visao]: ligado ? "" : g.chave })}
                    className={cn(
                      "relative flex w-full min-w-0 flex-col justify-between gap-1 overflow-hidden rounded-md border px-3 pb-2.5 pt-2 text-left transition-colors",
                      ligado ? "border-brand-primary bg-brand-50 ring-1 ring-brand-primary dark:bg-white/10" : "border-border hover:border-brand-primary dark:border-white/15"
                    )}
                  >
                    <span className="break-words text-xs font-medium text-ink-primary dark:text-white">{g.fluxo}</span>
                    <span className="text-xs tabular-nums text-ink-secondary dark:text-white/70">
                      <strong className="text-brand-primary dark:text-white">{contagemClientes(g.clientes)}</strong> ({formatarPercentual(g.percentual)})
                    </span>
                    <span aria-hidden className="absolute bottom-0 left-0 h-[3px] bg-brand-primary" style={{ width: `${g.percentual}%` }} />
                  </button>
                </li>
              );
            })}
          </ul>

          {total > 2 && (
            // O número de chips escondidos muda com a largura da tela.
            <button
              type="button"
              onClick={() => setVerTodas((v) => !v)}
              className={cn("self-start text-xs font-bold text-brand-primary hover:underline dark:text-white", total <= 4 && "sm:hidden", total > 4 && total <= 6 && "lg:hidden")}
            >
              {verTodas ? (
                "Ver menos"
              ) : (
                <>
                  <span className="sm:hidden">Ver todas as etapas (+{total - 2})</span>
                  <span className="hidden sm:inline lg:hidden">Ver todas as etapas (+{total - 4})</span>
                  <span className="hidden lg:inline">Ver todas as etapas (+{total - 6})</span>
                </>
              )}
            </button>
          )}

          {funil.notas.map((nota) => (
            <p key={nota} className="text-[11px] text-ink-muted">
              {nota}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
