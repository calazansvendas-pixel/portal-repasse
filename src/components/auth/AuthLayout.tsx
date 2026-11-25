"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils/cn";

/** Telas de Login e Criar conta (padrão Morar): barra branca com a marca e conteúdo centralizado. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-soft text-sm dark:bg-[#12140F]">
      <header className="w-full border-b border-border bg-surface dark:border-white/10 dark:bg-[#1B1E17]">
        <div className="mx-auto flex h-20 max-w-content items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-brand-200 bg-brand-100">
              <Image src="/logos/logo-morar-icon.png" alt="Morar" width={24} height={24} className="h-6 w-6 object-contain" priority />
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-ink-primary dark:text-white">
              Portal de Repasse
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function AuthCard({ children, centro }: { children: ReactNode; centro?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface px-5 py-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-[#1B1E17]",
        centro && "text-center"
      )}
    >
      {children}
    </div>
  );
}

export function AuthTitulo({ titulo, subtitulo, comIcone }: { titulo: string; subtitulo: string; comIcone?: boolean }) {
  return (
    <div className="mb-6 text-center">
      {comIcone && (
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-brand-100">
          <Image src="/logos/logo-morar-icon.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
        </span>
      )}
      <h1 className="text-lg font-bold text-ink-primary dark:text-white">{titulo}</h1>
      <p className="mt-1 text-xs leading-relaxed text-ink-secondary dark:text-white/60">{subtitulo}</p>
    </div>
  );
}

export function AuthAlerta({ tipo, children }: { tipo: "erro" | "ok"; children: ReactNode }) {
  const Icone = tipo === "erro" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs leading-relaxed",
        tipo === "erro" ? "bg-status-danger/10 text-status-danger" : "bg-brand-100 text-brand-900"
      )}
    >
      <Icone size={16} strokeWidth={2} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthCampo({
  rotulo,
  obrigatorio,
  opcional,
  dica,
  children,
}: {
  rotulo: string;
  obrigatorio?: boolean;
  opcional?: boolean;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-ink-secondary dark:text-white/70">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-status-danger">*</span>}
        {opcional && <span className="ml-1 font-normal text-ink-muted">(opcional)</span>}
      </span>
      {children}
      {dica && <span className="mt-1.5 block text-[11px] text-ink-muted">{dica}</span>}
    </label>
  );
}

/** Senha com o botão de mostrar/ocultar (Eye / EyeOff). */
export function CampoSenha(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [mostrar, setMostrar] = useState(false);
  const texto = mostrar ? "Ocultar senha" : "Mostrar senha";
  const Icone = mostrar ? EyeOff : Eye;
  return (
    <span className="relative block">
      <input {...props} type={mostrar ? "text" : "password"} className="input-field pr-11" />
      <button
        type="button"
        onClick={() => setMostrar((v) => !v)}
        title={texto}
        aria-label={texto}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted hover:text-ink-secondary"
      >
        <Icone size={16} strokeWidth={2} />
      </button>
    </span>
  );
}
