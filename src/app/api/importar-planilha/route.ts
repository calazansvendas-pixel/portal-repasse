import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { parseWorkbookBuffer } from "@/lib/services/parseSheet";
import { executarAuditoriaDiaria } from "@/lib/services/auditEngine";
import { podeImportarPlanilha } from "@/lib/auth/roles";
import { hojeISO } from "@/lib/utils/dates";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded) {
      return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.data()?.role as Role | undefined;
    if (!role || !podeImportarPlanilha(role)) {
      return NextResponse.json(
        { erro: "Seu perfil não tem permissão para importar planilhas." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("arquivo");
    if (!(file instanceof File)) {
      return NextResponse.json({ erro: "Nenhum arquivo enviado no campo 'arquivo'." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { sheetName, linhas, colunasNaoEncontradas } = parseWorkbookBuffer(buffer);

    if (linhas.length === 0) {
      return NextResponse.json(
        {
          erro: "Nenhuma linha válida foi encontrada na planilha. Verifique se a aba e os cabeçalhos seguem o padrão esperado.",
          colunasNaoEncontradas,
        },
        { status: 422 }
      );
    }

    const importacaoId = req.nextUrl.searchParams.get("data") || hojeISO();

    const resumo = await executarAuditoriaDiaria({
      db: adminDb,
      linhas,
      sheetName,
      importacaoId,
      nomeArquivo: file.name,
      importadoPor: decoded.uid,
    });

    return NextResponse.json({ resumo, colunasNaoEncontradas });
  } catch (error) {
    console.error("[importar-planilha] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido ao processar a planilha.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
