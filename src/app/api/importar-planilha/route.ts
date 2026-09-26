import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar } from "@/lib/server/tarefasManuais";
import { parseWorkbookBuffer } from "@/lib/services/parseSheet";
import { executarAuditoriaDiaria } from "@/lib/services/auditEngine";
import { podeImportarPlanilha } from "@/lib/auth/roles";
import { hojeISO } from "@/lib/utils/dates";

export const runtime = "nodejs";

/** yyyy-MM-dd que existe no calendário (recusa, por exemplo, 2026-02-31). */
function dataDeCalendarioValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeImportarPlanilha(auth.role)) {
      return NextResponse.json(
        { erro: "Seu perfil não tem permissão para importar planilhas." },
        { status: 403 }
      );
    }
    const adminDb = getAdminDb();

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

    const dataParam = req.nextUrl.searchParams.get("data");
    // Qualquer data de calendário válida (passada ou futura): a planilha do dia 24 costuma ser importada no dia 25.
    if (dataParam && !dataDeCalendarioValida(dataParam)) {
      return NextResponse.json({ erro: "Data da planilha inválida." }, { status: 400 });
    }
    const importacaoId = dataParam || hojeISO();

    const resumo = await executarAuditoriaDiaria({
      db: adminDb,
      linhas,
      sheetName,
      importacaoId,
      nomeArquivo: file.name,
      importadoPor: auth.uid,
    });

    return NextResponse.json({ resumo, colunasNaoEncontradas });
  } catch (error) {
    console.error("[importar-planilha] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro desconhecido ao processar a planilha.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
