"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { menuDaRota, primeiraRota, temMenu, type PerfilComMenus } from "@/lib/auth/menus";
import { avisar } from "@/lib/store/avisos";

/**
 * Barra o acesso direto por URL a um menu não liberado: leva ao primeiro menu permitido e avisa.
 * Como o perfil é ouvido em tempo real, revogar um menu também tira a pessoa da tela aberta.
 */
export function GuardaDeMenu({ perfil, caminho, children }: { perfil: PerfilComMenus; caminho: string; children: ReactNode }) {
  const router = useRouter();
  const menu = menuDaRota(caminho);
  const bloqueado = !!menu && !temMenu(perfil, menu.id);
  const destino = bloqueado ? primeiraRota(perfil) : null;
  /** Evita repetir o aviso enquanto o redirecionamento não termina. */
  const avisado = useRef<string | null>(null);

  useEffect(() => {
    if (!bloqueado || !destino) {
      avisado.current = null;
      return;
    }
    if (avisado.current !== caminho) {
      avisado.current = caminho;
      avisar(`Acesso restrito: seu perfil não tem o menu "${menu!.nome}".`, 7000, "info");
    }
    router.replace(destino);
  }, [bloqueado, destino, caminho, menu, router]);

  if (!bloqueado) return <>{children}</>;
  if (destino) return null;
  return (
    <div className="surface-card p-8 text-center text-sm text-ink-muted">
      Acesso restrito: nenhum menu está liberado para o seu perfil. Fale com quem administra o Portal de Repasse.
    </div>
  );
}
