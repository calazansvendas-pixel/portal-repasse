"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, semPerfil, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [loading, firebaseUser, router]);

  // Perfil desativado: encerra a sessão e manda para o login (o app não deve continuar aberto).
  const inativo = !!profile && profile.ativo === false;
  useEffect(() => {
    if (!inativo) return;
    signOut().finally(() => router.replace("/login?inativo=1"));
  }, [inativo, signOut, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-soft dark:bg-[#12140F]">
        <p className="text-sm text-ink-muted">Carregando…</p>
      </div>
    );
  }

  if (!firebaseUser) return null;

  if (semPerfil) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-soft px-4 dark:bg-[#12140F]">
        <div className="surface-card max-w-sm p-8 text-center">
          <h1 className="mb-2 text-lg font-bold text-ink-primary dark:text-white">
            Conta sem perfil configurado
          </h1>
          <p className="mb-4 text-sm text-ink-secondary dark:text-white/60">
            Seu login foi reconhecido, mas nenhum perfil de acesso (função) foi encontrado para
            este usuário. Peça à gerência para cadastrar seu perfil na coleção{" "}
            <code>users</code>.
          </p>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (!profile || inativo) return null;

  return (
    <div className="min-h-screen bg-surface-soft dark:bg-[#12140F]">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-6">
        <Sidebar profile={profile} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
