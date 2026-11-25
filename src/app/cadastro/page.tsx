"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { CARGOS_CADASTRO } from "@/lib/auth/cargos";
import { AuthAlerta, AuthCampo, AuthCard, AuthLayout, AuthTitulo, CampoSenha } from "@/components/auth/AuthLayout";
import { mascaraCpf, mascaraTelefone } from "@/lib/utils/cadastro";
import { hojeISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

const VAZIO = {
  nome: "",
  email: "",
  dataNascimento: "",
  telefone: "",
  cpf: "",
  creci: "",
  cargo: "",
  imobiliaria: "",
  senha: "",
  confirmarSenha: "",
};

type Campo = keyof typeof VAZIO;

/** Ficha "Criar conta" (pública). Superior Hierárquico não aparece aqui: é definido na aprovação. */
export default function CadastroPage() {
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);

  const campo = (nome: Campo, mascara?: (v: string) => string) => ({
    value: form[nome],
    onChange: (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [nome]: mascara ? mascara(e.target.value) : e.target.value })),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const { confirmarSenha, ...dados } = form;
    const obrigatorios: Campo[] = ["nome", "email", "dataNascimento", "telefone", "cpf", "cargo", "imobiliaria", "senha"];
    if (obrigatorios.some((c) => !form[c].trim())) return setErro("Preencha todos os campos obrigatórios.");
    if (dados.senha.length < 6) return setErro("A senha precisa ter pelo menos 6 caracteres.");
    if (dados.senha !== confirmarSenha) return setErro("As senhas não coincidem.");

    setEnviando(true);
    try {
      const res = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.erro ?? "Não foi possível criar o cadastro.");
      setEnviado(dados.email.trim());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o cadastro.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <AuthLayout>
        <AuthCard centro>
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-primary">
            <Mail size={24} strokeWidth={2} />
          </span>
          <h1 className="mb-2 text-lg font-bold text-ink-primary dark:text-white">Cadastro enviado</h1>
          <p className="text-xs leading-relaxed text-ink-secondary dark:text-white/60">
            Recebemos os dados de <b className="break-all text-ink-primary dark:text-white">{enviado}</b>.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-secondary dark:text-white/60">
            Um administrador vai revisar seu cadastro e liberar seu cargo e permissões em breve. Assim que seu acesso for
            liberado, você entra com o e-mail e a senha que acabou de criar.
          </p>
          <p className="mt-5">
            <Link href="/login" className="text-xs font-semibold text-brand-primary hover:underline">
              Voltar para o login
            </Link>
          </p>
        </AuthCard>
      </AuthLayout>
    );
  }

  const doisPorLinha = "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2";

  return (
    <AuthLayout>
      <AuthCard>
        <AuthTitulo titulo="Criar sua conta" subtitulo="Preencha seus dados. Um administrador revisa e libera seu acesso." />
        {erro && <AuthAlerta tipo="erro">{erro}</AuthAlerta>}

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <AuthCampo rotulo="Nome completo" obrigatorio>
            <input type="text" className="input-field" placeholder="Ex.: Marina Cordeiro" autoComplete="name" {...campo("nome")} />
          </AuthCampo>
          <AuthCampo rotulo="E-mail" obrigatorio>
            <input type="email" className="input-field" placeholder="voce@imobiliaria.com.br" autoComplete="email" {...campo("email")} />
          </AuthCampo>
          <div className={doisPorLinha}>
            <AuthCampo rotulo="Data de Nascimento" obrigatorio>
              <input type="date" className="input-field" max={hojeISO()} {...campo("dataNascimento")} />
            </AuthCampo>
            <AuthCampo rotulo="Telefone/WhatsApp" obrigatorio>
              <input type="tel" inputMode="numeric" className="input-field" placeholder="(27) 99999-0000" autoComplete="tel" {...campo("telefone", mascaraTelefone)} />
            </AuthCampo>
          </div>
          <div className={doisPorLinha}>
            <AuthCampo rotulo="CPF" obrigatorio>
              <input type="text" inputMode="numeric" className="input-field" placeholder="000.000.000-00" {...campo("cpf", mascaraCpf)} />
            </AuthCampo>
            <AuthCampo rotulo="CRECI" opcional>
              <input type="text" className="input-field" placeholder="ES-00000" {...campo("creci")} />
            </AuthCampo>
          </div>
          <AuthCampo rotulo="Cargo/Perfil pretendido" obrigatorio dica="O administrador confirma esse cargo antes de liberar seu acesso.">
            <select className={cn("input-field", !form.cargo && "text-ink-muted")} {...campo("cargo")}>
              <option value="" disabled>
                Selecione seu cargo
              </option>
              {CARGOS_CADASTRO.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </AuthCampo>
          <AuthCampo rotulo="Imobiliária/Equipe/Loja" obrigatorio>
            <input type="text" className="input-field" placeholder="Ex.: Cordeiro Imóveis" {...campo("imobiliaria")} />
          </AuthCampo>
          <div className={doisPorLinha}>
            <AuthCampo rotulo="Senha" obrigatorio>
              <CampoSenha placeholder="Crie uma senha" autoComplete="new-password" {...campo("senha")} />
            </AuthCampo>
            <AuthCampo rotulo="Confirmar Senha" obrigatorio>
              <CampoSenha placeholder="Repita a senha" autoComplete="new-password" {...campo("confirmarSenha")} />
            </AuthCampo>
          </div>
          <button type="submit" disabled={enviando} className="btn-primary w-full font-bold">
            {enviando ? "Criando conta…" : "Criar conta"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-secondary dark:text-white/60">
          Já tem conta?{" "}
          <Link href="/login" className="font-semibold text-brand-primary hover:underline">
            Entrar
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
