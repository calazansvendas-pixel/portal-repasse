"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { avisar } from "@/lib/store/avisos";
import type { AcaoUsuario } from "@/lib/auth/acoesUsuario";
import type { CargoId, PermissoesParciais, PermissoesPorCargo } from "@/lib/auth/cargos";
import type { UsuarioPainel } from "@/lib/server/usuarios";

/** Dados e ações do Painel do Administrador (tudo passa pelas rotas /api/admin). */
export function useAdmin(habilitado: boolean) {
  const { firebaseUser } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioPainel[]>([]);
  const [permissoesPorCargo, setPermissoesPorCargo] = useState<PermissoesPorCargo>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const chamar = useCallback(
    async (url: string, metodo: "GET" | "PATCH" | "PUT", corpo?: unknown) => {
      if (!firebaseUser) throw new Error("Sessão encerrada.");
      const res = await fetch(url, {
        method: metodo,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`,
          ...(corpo ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.erro ?? `Falha na solicitação (HTTP ${res.status}).`);
      return json;
    },
    [firebaseUser]
  );

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const json = await chamar("/api/admin/usuarios", "GET");
      setUsuarios(json.usuarios);
      setPermissoesPorCargo(json.permissoesPorCargo);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os usuários.");
    } finally {
      setCarregando(false);
    }
  }, [chamar]);

  useEffect(() => {
    if (habilitado && firebaseUser) recarregar();
  }, [habilitado, firebaseUser, recarregar]);

  /** Executa a ação e recarrega. Devolve a mensagem de erro (ou null se deu certo). */
  const agir = useCallback(
    async (uid: string, acao: AcaoUsuario, avisarErro = true): Promise<string | null> => {
      setOcupado(uid);
      try {
        await chamar(`/api/admin/usuarios/${uid}`, "PATCH", acao);
        await recarregar();
        return null;
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : "Não foi possível concluir.";
        if (avisarErro) avisar(mensagem);
        return mensagem;
      } finally {
        setOcupado(null);
      }
    },
    [chamar, recarregar]
  );

  const salvarPermissoesDoCargo = useCallback(
    async (cargo: CargoId, permissoes: PermissoesParciais): Promise<string | null> => {
      try {
        await chamar("/api/admin/permissoes-cargo", "PUT", { cargo, permissoes });
        await recarregar();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Não foi possível salvar.";
      }
    },
    [chamar, recarregar]
  );

  return { usuarios, permissoesPorCargo, carregando, erro, ocupado, recarregar, agir, salvarPermissoesDoCargo };
}

export type Admin = ReturnType<typeof useAdmin>;
