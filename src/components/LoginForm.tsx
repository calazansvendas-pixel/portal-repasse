"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

const ERROS_AMIGAVEIS: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-disabled": "Este usuário está desativado. Fale com a gerência.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente.",
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      router.replace("/dashboard");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setErro(ERROS_AMIGAVEIS[code] ?? "Não foi possível entrar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-4 dark:bg-[#12140F]">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center justify-between">
          <Image
            src="/logos/logo-morar-verde.png"
            alt="Morar Construtora e Incorporadora"
            width={140}
            height={40}
            priority
            className="h-9 w-auto object-contain"
          />
          <ThemeToggle />
        </div>

        <form onSubmit={handleSubmit} className="surface-card p-8">
          <h1 className="mb-1 text-2xl font-bold text-ink-primary dark:text-white">
            Portal de Repasse
          </h1>
          <p className="mb-6 text-sm text-ink-secondary dark:text-white/60">
            Entre com sua conta corporativa para acessar seus painéis e tarefas.
          </p>

          <label className="mb-1 block text-sm font-medium text-ink-primary dark:text-white">
            E-mail
          </label>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field mb-4"
            placeholder="voce@morar.com.br"
          />

          <label className="mb-1 block text-sm font-medium text-ink-primary dark:text-white">
            Senha
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="input-field mb-2"
            placeholder="••••••••"
          />

          {erro && (
            <p className="mb-2 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {erro}
            </p>
          )}

          <button type="submit" disabled={carregando} className="btn-primary mt-4 w-full">
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Acesso restrito à equipe Morar. Problemas para entrar? Fale com a coordenação.
        </p>
      </div>
    </div>
  );
}
