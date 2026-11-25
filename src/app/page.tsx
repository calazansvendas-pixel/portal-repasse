"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { primeiraRota } from "@/lib/auth/menus";

export default function RootPage() {
  const { firebaseUser, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inicio = (profile && primeiraRota(profile)) || "/dashboard";
    router.replace(firebaseUser ? inicio : "/login");
  }, [loading, firebaseUser, profile, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft">
      <p className="text-sm text-ink-muted">Carregando…</p>
    </div>
  );
}
