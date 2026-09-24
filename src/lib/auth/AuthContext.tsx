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
import type { UserProfile } from "@/lib/types";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  // true quando há sessão de auth mas nenhum documento em /users/{uid} (conta não provisionada)
  semPerfil: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    setProfileLoading(true);
    const ref = doc(db, "users", firebaseUser.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
        setProfileLoading(false);
      },
      () => {
        setProfile(null);
        setProfileLoading(false);
      }
    );
    return () => unsubscribe();
  }, [firebaseUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      loading: authLoading || profileLoading,
      semPerfil: !authLoading && !!firebaseUser && !profileLoading && !profile,
      signOut: () => firebaseSignOut(auth),
    }),
    [firebaseUser, profile, authLoading, profileLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
