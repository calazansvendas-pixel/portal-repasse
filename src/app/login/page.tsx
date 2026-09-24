"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && firebaseUser) router.replace("/dashboard");
  }, [loading, firebaseUser, router]);

  if (loading || firebaseUser) return null;

  return <LoginForm />;
}
