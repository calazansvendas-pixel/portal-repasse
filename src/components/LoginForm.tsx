"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { AuthAlerta, AuthCampo, AuthCard, AuthLayout, AuthTitulo, CampoSenha } from "@/components/auth/AuthLayout";

const ERROS_AMIGAVEIS: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/wrong-password": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/user-not-found": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-disabled": "Este usuário foi desativado.",
  "auth/too-many-requests": "Muitas tentativas seguidas — aguarde um pouco e tente de novo.",
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function limparAvisos() {
    setErro(null);
    setInfo(null);
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    limparAvisos();
    if (!email.trim() || !senha) return setErro("Preencha e-mail e senha.");
    setCarregando(true);
    try {
      // A página de login decide o destino: painel, ou a tela de status da conta.
      await signInWithEmailAndPassword(auth, email.trim(), senha);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setErro(ERROS_AMIGAVEIS[code] ?? "Não foi possível entrar. Tente novamente.");
      setCarregando(false);
    }
  }

  async function redefinirSenha() {
    limparAvisos();
    const destino = email.trim();
    if (!destino) return setErro('Digite seu e-mail no campo acima e clique em "Esqueci minha senha" novamente.');
    try {
      await sendPasswordResetEmail(auth, destino);
      setInfo(`Enviamos um link de redefinição de senha para ${destino}.`);
    } catch (err) {
      setErro(
        (err as { code?: string })?.code === "auth/invalid-email"
          ? "E-mail inválido."
          : "Não foi possível enviar o e-mail de recuperação agora. Tente novamente em instantes."
      );
    }
  }

  return (
    <AuthLayout>
      <AuthCard>
        <AuthTitulo comIcone titulo="Bem-vindo(a) de volta" subtitulo="Entre com seu e-mail e senha para acessar sua conta." />
        {erro && <AuthAlerta tipo="erro">{erro}</AuthAlerta>}
        {info && <AuthAlerta tipo="ok">{info}</AuthAlerta>}

        <form onSubmit={entrar} noValidate className="flex flex-col gap-4">
          <AuthCampo rotulo="E-mail">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="voce@imobiliaria.com.br"
            />
          </AuthCampo>
          <div>
            <AuthCampo rotulo="Senha">
              <CampoSenha autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
            </AuthCampo>
            <div className="mt-1.5 flex justify-end">
              <button type="button" onClick={redefinirSenha} className="text-xs font-semibold text-brand-primary hover:underline">
                Esqueci minha senha
              </button>
            </div>
          </div>
          <button type="submit" disabled={carregando} className="btn-primary w-full font-bold">
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-secondary dark:text-white/60">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-brand-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
