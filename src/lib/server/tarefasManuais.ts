import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { destinatariosPermitidos } from "@/lib/auth/roles";
import { dataDeCalendarioValida } from "@/lib/utils/dates";
import type { NivelTarefa, Quadro, Role } from "@/lib/types";

export const LIMITE_DESCRICAO = 1000;

export const NIVEL_POR_QUADRO: Record<Quadro, NivelTarefa> = {
  laiza: "operacional",
  eliane: "operacional",
  catarina: "operacional",
  analista: "analitico",
  coordenador: "tatico",
};

export interface Autenticado {
  uid: string;
  role: Role;
  nome: string | null;
}

/** Valida o Bearer token e carrega o perfil; devolve a resposta de erro pronta quando falha. */
export async function autenticar(req: NextRequest): Promise<Autenticado | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
  if (!decoded) return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });

  const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
  const perfil = userSnap.data() as { role?: Role; nome?: string; ativo?: boolean } | undefined;
  // Mesmo rigor do firestore.rules: só `ativo === true` passa (campo ausente ou false = sem acesso).
  if (!perfil?.role || perfil.ativo !== true) {
    return NextResponse.json({ erro: "Usuário sem perfil ativo." }, { status: 403 });
  }
  return { uid: decoded.uid, role: perfil.role, nome: perfil.nome ?? null };
}

/** Valida descrição + destinatário conforme a hierarquia de quem está agindo. */
export function validarDescricaoEDestino(
  role: Role,
  descricaoBruta: unknown,
  destino: unknown,
  manter?: Quadro // destinatário atual (edição): pode ser mantido mesmo fora da lista do editor
): { descricao: string; atribuidoPara: Quadro } | NextResponse {
  const descricao = typeof descricaoBruta === "string" ? descricaoBruta.trim() : "";
  if (!descricao) return NextResponse.json({ erro: "Informe a descrição da tarefa." }, { status: 400 });
  if (descricao.length > LIMITE_DESCRICAO) {
    return NextResponse.json({ erro: `A descrição excede ${LIMITE_DESCRICAO} caracteres.` }, { status: 400 });
  }
  const atribuidoPara = destino as Quadro | undefined;
  if (!atribuidoPara || (atribuidoPara !== manter && !destinatariosPermitidos(role).includes(atribuidoPara))) {
    return NextResponse.json({ erro: "Você não pode atribuir tarefas a esse colaborador." }, { status: 403 });
  }
  return { descricao, atribuidoPara };
}

/**
 * Lê a data limite do corpo da requisição: undefined = não informada;
 * null = removida ("" ou null); string yyyy-MM-dd válida; senão, resposta 400.
 */
export function lerDataLimite(bruta: unknown): string | null | undefined | NextResponse {
  if (bruta === undefined) return undefined;
  if (bruta === null || bruta === "") return null;
  if (typeof bruta !== "string" || !dataDeCalendarioValida(bruta)) {
    return NextResponse.json({ erro: "Data limite inválida." }, { status: 400 });
  }
  return bruta;
}
