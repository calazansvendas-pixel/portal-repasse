"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { statusDoPerfil } from "@/lib/auth/cargos";
import { Sidebar } from "@/components/layout/Sidebar";
import { GuardaDeMenu } from "@/components/layout/GuardaDeMenu";
import { Avisos } from "@/components/ui/Avisos";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Mesmo rigor do firestore.rules: só `ativo === true` entra (campo ausente também não). Sem sessão,
  // sem perfil, pendente, pausado ou excluído: o painel não abre e o /login mostra a tela certa.
  const liberado = !!firebaseUser && !!profile && profile.ativo === true && statusDoPerfil(profile) === "ativo";
  useEffect(() => {
    if (!loading && !liberado) router.replace("/login");
  }, [loading, liberado, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-soft dark:bg-[#12140F]">
        <p className="text-sm text-ink-muted">Carregando…</p>
      </div>
    );
  }

  if (!liberado || !profile) return null;

  return (
    <div className="min-h-screen bg-surface-soft dark:bg-[#12140F]">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:flex-row lg:gap-6">
        <Sidebar profile={profile} />
        <main className="min-w-0 flex-1">
          <GuardaDeMenu perfil={profile} caminho={pathname}>
            {children}
          </GuardaDeMenu>
        </main>
      </div>
      <Avisos />
    </div>
  );
}
