import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { destinatariosPermitidos } from "@/lib/auth/roles";
import type { NivelTarefa, Quadro, Role, Tarefa } from "@/lib/types";

export const runtime = "nodejs";

const LIMITE_DESCRICAO = 1000;

const NIVEL_POR_QUADRO: Record<Quadro, NivelTarefa> = {
  laiza: "operacional",
  eliane: "operacional",
  catarina: "operacional",
  analista: "analitico",
  coordenador: "tatico",
};

/**
 * Cria uma Tarefa Avulsa (origem "manual"): demanda interna delegada de cima
 * para baixo, sem relação com a planilha. A hierarquia de destinatários é
 * validada aqui, no servidor (o client SDK não pode criar tarefas).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });

    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const perfil = userSnap.data() as { role?: Role; nome?: string; ativo?: boolean } | undefined;
    if (!perfil?.role || perfil.ativo === false) {
      return NextResponse.json({ erro: "Usuário sem perfil ativo." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { descricao?: unknown; atribuidoPara?: unknown } | null;
    const descricao = typeof body?.descricao === "string" ? body.descricao.trim() : "";
    const atribuidoPara = body?.atribuidoPara as Quadro | undefined;

    if (!descricao) return NextResponse.json({ erro: "Informe a descrição da tarefa." }, { status: 400 });
    if (descricao.length > LIMITE_DESCRICAO) {
      return NextResponse.json({ erro: `A descrição excede ${LIMITE_DESCRICAO} caracteres.` }, { status: 400 });
    }
    if (!atribuidoPara || !destinatariosPermitidos(perfil.role).includes(atribuidoPara)) {
      return NextResponse.json({ erro: "Você não pode atribuir tarefas a esse colaborador." }, { status: 403 });
    }

    const agora = new Date().toISOString();
    const ref = adminDb.collection("tarefas").doc();
    const tarefa: Omit<Tarefa, "id"> = {
      chaveRegra: `MANUAL::${ref.id}`,
      origem: "manual",
      nivel: NIVEL_POR_QUADRO[atribuidoPara],
      numero: null,
      numerosRelacionados: null,
      clienteNome: null,
      dataEntrada: null,
      cidade: "",
      praca: atribuidoPara,
      imobiliaria: "",
      etapa: "",
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: "Tarefa avulsa",
      descricao,
      observacaoOriginal: "",
      status: "pendente",
      criadoEm: agora,
      atualizadoEm: agora,
      resolvidoPor: null,
      resolvidoEm: null,
      etapaNoMomentoResolucao: null,
      observacaoNoMomentoResolucao: null,
      notaResolucao: null,
      falhaAuditoriaMotivo: null,
      falhaAuditoriaEm: null,
      escalonadoPara: [],
      historicoEtapas: [],
      criadaPor: decoded.uid,
      criadaPorNome: perfil.nome ?? null,
    };
    await ref.set(tarefa);

    return NextResponse.json({ id: ref.id });
  } catch (error) {
    console.error("[tarefas/POST] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao criar a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
