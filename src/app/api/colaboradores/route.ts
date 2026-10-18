import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeConfigurarRegrasAuditoria } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { lerColaboradoresAtivos } from "@/lib/server/analytics";
import type { Assistente, Role } from "@/lib/types";

export const runtime = "nodejs";

export interface Colaborador {
  uid: string;
  nome: string;
  role: Role;
  praca?: Assistente;
}

/** Lista de colaboradores ativos, para o seletor de "destino fixo" do Motor de Regras. Gerência apenas. */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeConfigurarRegrasAuditoria(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const colaboradores = await lerColaboradoresAtivos(getAdminDb());
    return NextResponse.json({ colaboradores });
  } catch (error) {
    console.error("[colaboradores] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao carregar colaboradores.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
