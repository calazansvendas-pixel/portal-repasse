import type { Tarefa } from "@/lib/types";
import { formatDateBR } from "@/lib/utils/dates";
import { fatiarObservacao } from "@/lib/utils/texto";
import { cn } from "@/lib/utils/cn";

export function ObservacaoChecklist({ texto }: { texto: string }) {
  const itens = fatiarObservacao(texto);
  if (itens.length === 0) return null;
  return (
    <ul className="space-y-1">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-secondary dark:text-white/70">
          <span className="mt-0.5 shrink-0 text-ink-muted">▢</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Stepper vertical: Entrada -> cada etapa alcançada, com a data de cada salto. */
export function TrajetoPasta({ tarefa }: { tarefa: Tarefa }) {
  const passos: { titulo: string; data: string | null }[] = [
    ...(tarefa.dataEntrada ? [{ titulo: "Entrada", data: tarefa.dataEntrada }] : []),
    ...(tarefa.historicoEtapas ?? []).map((h) => ({ titulo: `Etapa ${h.etapa}`, data: h.data })),
  ];
  if (passos.length === 0 && tarefa.etapa) {
    passos.push({ titulo: `Etapa ${tarefa.etapa}`, data: null });
  }

  return (
    <ol>
      {passos.map((passo, i) => {
        const ultimo = i === passos.length - 1;
        return (
          <li key={i} className="flex gap-2">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                  ultimo ? "bg-brand-primary" : "bg-border dark:bg-white/25"
                )}
              />
              {!ultimo && <span className="w-px flex-1 bg-border dark:bg-white/15" />}
            </div>
            <div className={cn("flex flex-1 items-center justify-between gap-2", !ultimo && "pb-2")}>
              <span
                className={cn(
                  "text-xs",
                  ultimo ? "font-semibold text-ink-primary dark:text-white" : "text-ink-secondary dark:text-white/60"
                )}
              >
                {passo.titulo}
              </span>
              <span className="text-[11px] text-ink-muted">{formatDateBR(passo.data)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
