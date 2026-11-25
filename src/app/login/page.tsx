"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { statusDoPerfil } from "@/lib/auth/cargos";
import { LoginForm } from "@/components/LoginForm";
import { StatusDaConta } from "@/components/auth/StatusDaConta";

export default function LoginPage() {
  const { firebaseUser, profile, loading, avisoDono, signOut } = useAuth();
  const router = useRouter();
  const status = profile ? statusDoPerfil(profile) : null;
  const liberado = status === "ativo" && profile?.ativo === true;

  useEffect(() => {
    if (!loading && firebaseUser && liberado) router.replace("/dashboard");
  }, [loading, firebaseUser, liberado, router]);

  if (loading || liberado) return null;
  if (!firebaseUser) return <LoginForm />;

  return (
    <StatusDaConta
      status={!status ? "semPerfil" : status === "ativo" ? "pausado" : status}
      email={firebaseUser.email}
      aviso={avisoDono}
      onSair={() => signOut()}
    />
  );
}
