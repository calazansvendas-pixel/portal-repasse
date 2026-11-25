"use client";

import { Ban, Clock, UserX } from "lucide-react";
import { MENSAGEM_STATUS, type StatusConta } from "@/lib/auth/cargos";
import { AuthCard, AuthLayout } from "@/components/auth/AuthLayout";

const ICONES = { pendente: Clock, pausado: Ban, excluido: UserX };

/** Tela de quem tem login mas não pode entrar: aguardando aprovação, pausada, excluída ou sem perfil. */
export function StatusDaConta({
  status,
  email,
  aviso,
  onSair,
}: {
  status: Exclude<StatusConta, "ativo"> | "semPerfil";
  email: string | null;
  aviso?: string | null;
  onSair: () => void;
}) {
  const { titulo, texto } =
    status === "semPerfil"
      ? {
          titulo: "Conta sem perfil configurado",
          texto: "Seu login foi reconhecido, mas não há um cadastro de acesso para ele. Fale com um administrador.",
        }
      : MENSAGEM_STATUS[status];
  const Icone = status === "semPerfil" ? UserX : ICONES[status];

  return (
    <AuthLayout>
      <AuthCard centro>
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-primary">
          <Icone size={24} strokeWidth={2} />
        </span>
        <h1 className="mb-2 text-lg font-bold text-ink-primary dark:text-white">{titulo}</h1>
        <p className="text-xs leading-relaxed text-ink-secondary dark:text-white/60">{aviso ?? texto}</p>
        {email && <p className="mt-2 break-all text-xs text-ink-muted">{email}</p>}
        <button type="button" className="mt-5 text-xs font-semibold text-brand-primary hover:underline" onClick={onSair}>
          Voltar para o login
        </button>
      </AuthCard>
    </AuthLayout>
  );
}
