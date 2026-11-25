"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ASSISTENTE_LABEL } from "@/lib/types";
import type { Assistente } from "@/lib/types";
import type { StatusConta } from "@/lib/auth/cargos";
import { cn } from "@/lib/utils/cn";

export const PRACAS = Object.keys(ASSISTENTE_LABEL) as Assistente[];

/** Cartão que abre e fecha. `forcarAberto` (busca ativa) ignora o estado recolhido. */
export function Secao({
  titulo,
  contagem,
  descricao,
  abertaInicial = false,
  forcarAberto = false,
  children,
}: {
  titulo: string;
  contagem?: number;
  descricao?: string;
  abertaInicial?: boolean;
  forcarAberto?: boolean;
  children: ReactNode;
}) {
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const aberta = forcarAberto || (escolha ?? abertaInicial);
  const Seta = aberta ? ChevronUp : ChevronDown;
  return (
    <section className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setEscolha(!aberta)}
        aria-expanded={aberta}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-soft sm:px-5 dark:hover:bg-white/5"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink-primary dark:text-white">{titulo}</h2>
            {contagem !== undefined && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-900">
                {contagem}
              </span>
            )}
          </span>
          {descricao && <span className="mt-1 block text-xs text-ink-muted">{descricao}</span>}
        </span>
        <Seta size={18} strokeWidth={2} className="shrink-0 text-ink-muted" aria-label={aberta ? "Recolher" : "Expandir"} />
      </button>
      {aberta && <div className="border-t border-border dark:border-white/10">{children}</div>}
    </section>
  );
}

type Tom = "contorno" | "verde" | "editar" | "perigo";

const TONS: Record<Tom, string> = {
  contorno: "border-border text-ink-secondary hover:border-status-danger/50 hover:text-status-danger dark:border-white/15 dark:text-white/70",
  verde: "border-brand-primary bg-brand-primary text-white hover:bg-brand-primaryDark",
  editar: "border-brand-200 text-brand-primary hover:bg-brand-100 dark:border-white/20 dark:text-brand-300 dark:hover:bg-white/5",
  perigo: "border-status-danger bg-status-danger text-white hover:opacity-90",
};

export function Botao({ tom = "contorno", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tom?: Tom }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        TONS[tom],
        className
      )}
    />
  );
}

export function PilulaCargo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-900">{children}</span>
  );
}

const STATUS: Record<StatusConta, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-status-success/10 text-status-success" },
  pendente: { rotulo: "Pendente", classe: "bg-status-warning/15 text-status-warning" },
  pausado: { rotulo: "Pausado", classe: "bg-surface-soft text-ink-secondary dark:bg-white/10 dark:text-white/70" },
  excluido: { rotulo: "Excluído", classe: "bg-status-danger/10 text-status-danger" },
};

export function PilulaStatus({ status, recusado }: { status: StatusConta; recusado?: boolean }) {
  const { rotulo, classe } = STATUS[status];
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-bold", classe)}>
      {status === "excluido" && recusado ? "Recusado" : rotulo}
    </span>
  );
}

export function Interruptor({
  ligado,
  onChange,
  rotulo,
  desabilitado,
  titulo,
}: {
  ligado: boolean;
  onChange: (ligado: boolean) => void;
  rotulo: string;
  desabilitado?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={titulo ?? rotulo}
      disabled={desabilitado}
      onClick={() => onChange(!ligado)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        ligado ? "bg-brand-primary" : "bg-ink-muted/40"
      )}
    >
      <span
        className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", ligado && "translate-x-4")}
      />
    </button>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-ink-secondary dark:text-white/70">{children}</span>;
}
