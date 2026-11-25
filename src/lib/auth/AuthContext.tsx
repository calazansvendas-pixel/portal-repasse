"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { EMAIL_DONO, statusDoPerfil } from "@/lib/auth/cargos";
import type { UserProfile } from "@/lib/types";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  // true quando há sessão de auth mas nenhum documento em /users/{uid} (conta não provisionada)
  semPerfil: boolean;
  /** Por que o acesso de Dono ainda não foi ativado (ex.: e-mail sem confirmação). */
  avisoDono: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // O perfil guarda de QUEM ele é: enquanto não for do usuário atual, ainda está carregando.
  const [lido, setLido] = useState<{ uid: string; profile: UserProfile | null } | null>(null);
  const [dono, setDono] = useState<{ uid: string; aviso: string | null } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setLido(null);
        setDono(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    const ref = doc(db, "users", uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setLido({ uid, profile: snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null }),
      () => setLido({ uid, profile: null })
    );
    return () => unsubscribe();
  }, [firebaseUser]);

  const perfilCarregado = !!firebaseUser && lido?.uid === firebaseUser.uid;
  const profile = perfilCarregado ? lido!.profile : null;

  // Dono do aplicativo: se o perfil ainda não está como Dono ativo, o servidor provisiona (só com
  // o e-mail confirmado). Uma tentativa por sessão.
  const precisaDono =
    perfilCarregado &&
    firebaseUser!.email?.toLowerCase() === EMAIL_DONO &&
    !(profile?.cargo === "dono" && statusDoPerfil(profile) === "ativo");
  const donoResolvido = !!firebaseUser && dono?.uid === firebaseUser.uid;

  useEffect(() => {
    if (!precisaDono || donoResolvido || !firebaseUser) return;
    const uid = firebaseUser.uid;
    firebaseUser
      .getIdToken(true) // token novo: reflete a confirmação de e-mail recém-feita
      .then((token) => fetch("/api/conta/dono", { method: "POST", headers: { Authorization: `Bearer ${token}` } }))
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        setDono({ uid, aviso: res.ok ? null : json?.erro ?? "Não foi possível ativar o acesso de Dono." });
      })
      .catch(() => setDono({ uid, aviso: "Não foi possível ativar o acesso de Dono. Tente novamente." }));
  }, [precisaDono, donoResolvido, firebaseUser]);

  const loading = authLoading || (!!firebaseUser && !perfilCarregado) || (precisaDono && !donoResolvido);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading,
      semPerfil: !loading && !!firebaseUser && !profile,
      avisoDono: precisaDono ? dono?.aviso ?? null : null,
      signOut: () => firebaseSignOut(auth),
    }),
    [firebaseUser, profile, loading, precisaDono, dono]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
