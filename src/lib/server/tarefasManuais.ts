import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { destinatariosPermitidos } from "@/lib/auth/roles";
import { dataDeCalendarioValida } from "@/lib/utils/dates";
import type { NivelTarefa, Quadro, Role, UserProfile } from "@/lib/types";

export const LIMITE_DESCRICAO = 1000;

export const NIVEL_POR_QUADRO: Record<Quadro, NivelTarefa> = {
  layza: "operacional",
  eliane: "operacional",
  catharina: "operacional",
  analista: "analitico",
  coordenador: "tatico",
  gerencia: "tatico",
};

export interface Autenticado {
  uid: string;
  role: Role;
  nome: string | null;
  /** Perfil completo (cargo, permissões) para as rotas que checam permissões individuais. */
  perfil: UserProfile;
}

/** Colaborador ativo dono do quadro — só quando é único; ambíguo/ausente = null (o quadro basta). */
async function resolverColaboradorDoQuadro(quadro: Quadro): Promise<{ uid: string; nome: string } | null> {
  const snap = await getAdminDb().collection("users").where("ativo", "==", true).get();
  const donos = snap.docs.filter((d) => {
    const u = d.data() as { role?: Role; praca?: string };
    return quadro === "coordenador" || quadro === "analista" || quadro === "gerencia"
      ? u.role === quadro
      : u.role === "assistente" && u.praca === quadro;
  });
  if (donos.length !== 1) return null;
  const nome = (donos[0].data() as { nome?: string }).nome;
  return nome ? { uid: donos[0].id, nome } : null;
}

/**
 * Troca de colaborador = atribuição manual explícita: o quadro, o carimbo de responsável e o
 * override mudam juntos, para o card trocar de coluna na hora e as importações não reverterem.
 */
export async function camposDeTransferencia(novoQuadro: Quadro) {
  const responsavel = await resolverColaboradorDoQuadro(novoQuadro);
  return {
    praca: novoQuadro,
    quadro: novoQuadro,
    responsavelId: responsavel?.uid ?? null,
    responsavelNome: responsavel?.nome ?? null,
    overrideManual: true,
    pracaCustomizada: novoQuadro,
    responsavelCustomizadoId: responsavel?.uid ?? null,
    responsavelCustomizadoNome: responsavel?.nome ?? null,
  };
}

/** Valida o Bearer token e carrega o perfil; devolve a resposta de erro pronta quando falha. */
export async function autenticar(req: NextRequest): Promise<Autenticado | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
  if (!decoded) return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });

  const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
  const perfil = userSnap.data() as Omit<UserProfile, "uid"> | undefined;
  // Mesmo rigor do firestore.rules: só `ativo === true` passa (campo ausente ou false = sem acesso).
  if (!perfil?.role || perfil.ativo !== true) {
    return NextResponse.json({ erro: "Usuário sem perfil ativo." }, { status: 403 });
  }
  return { uid: decoded.uid, role: perfil.role, nome: perfil.nome ?? null, perfil: { ...perfil, uid: decoded.uid } };
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
