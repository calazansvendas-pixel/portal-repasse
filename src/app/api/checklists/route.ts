import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { temMenu } from "@/lib/auth/menus";
import { autenticar, type Autenticado } from "@/lib/server/tarefasManuais";
import { COLECAO_CHECKLISTS, lerConfiguracao } from "@/lib/server/organograma";
import { respostaDeErro } from "@/lib/server/usuarios";
import { itensDoChecklist } from "@/lib/organograma/calculo";
import type { ChecklistEtapa, ChecklistPastaDoc, Resposta } from "@/lib/organograma/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem enxerga o Organograma ou o Dossiê pode ler e preencher os checklists. */
async function autorizar(req: NextRequest): Promise<Autenticado | NextResponse> {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!temMenu(auth.perfil, "organograma") && !temMenu(auth.perfil, "dossie")) {
    return NextResponse.json({ erro: "Seu perfil não tem acesso aos checklists." }, { status: 403 });
  }
  return auth;
}

const numeroValido = (n: unknown): n is string => typeof n === "string" && /^[^/]{1,100}$/.test(n) && !n.startsWith("__");

export async function GET(req: NextRequest) {
  try {
    const auth = await autorizar(req);
    if (auth instanceof NextResponse) return auth;
    const numero = req.nextUrl.searchParams.get("numero");
    if (!numeroValido(numero)) return NextResponse.json({ erro: "Pasta inválida." }, { status: 400 });
    const db = getAdminDb();
    const [{ etapas, pracas }, doc] = await Promise.all([lerConfiguracao(db, false), db.collection(COLECAO_CHECKLISTS).doc(numero).get()]);
    const checklist: ChecklistPastaDoc = { etapas: (doc.data()?.etapas ?? {}) as ChecklistPastaDoc["etapas"] };
    return NextResponse.json({ etapas, pracas, checklist });
  } catch (error) {
    return respostaDeErro("checklists/GET", error);
  }
}

/**
 * Altera uma coisa por vez (um item, a modalidade ou a chave de casal). A gravação é por mesclagem,
 * então duas pessoas marcando itens diferentes não apagam o trabalho uma da outra.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await autorizar(req);
    if (auth instanceof NextResponse) return auth;
    const corpo = (await req.json().catch(() => null)) as {
      numero?: unknown;
      etapa?: unknown;
      item?: unknown;
      valor?: unknown;
      modalidadeId?: unknown;
      casal?: unknown;
    } | null;
    if (!numeroValido(corpo?.numero)) return NextResponse.json({ erro: "Pasta inválida." }, { status: 400 });
    const numero = corpo!.numero as string;

    const db = getAdminDb();
    const ref = db.collection(COLECAO_CHECKLISTS).doc(numero);
    const [{ etapas }, pasta, atual] = await Promise.all([lerConfiguracao(db, false), db.collection("registros").doc(numero).get(), ref.get()]);
    if (!pasta.exists) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
    const etapa = etapas.find((e) => e.codigo === corpo!.etapa);
    if (!etapa?.modalidades.length) return NextResponse.json({ erro: "Esta etapa não tem checklist." }, { status: 400 });

    const marcado = (atual.data()?.etapas?.[etapa.codigo] ?? {}) as ChecklistEtapa;
    const agora = new Date().toISOString();
    const mudanca: ChecklistEtapa = {};

    if (corpo!.modalidadeId !== undefined) {
      if (!etapa.modalidades.some((m) => m.id === corpo!.modalidadeId)) {
        return NextResponse.json({ erro: "Modalidade inválida." }, { status: 400 });
      }
      mudanca.modalidadeId = corpo!.modalidadeId as string;
    } else if (corpo!.casal !== undefined) {
      if (!etapa.permiteCasal || typeof corpo!.casal !== "boolean") return NextResponse.json({ erro: "Opção inválida." }, { status: 400 });
      mudanca.casal = corpo!.casal;
    } else {
      const item = itensDoChecklist(etapa, marcado).find((i) => i.chave === corpo!.item);
      if (!item) return NextResponse.json({ erro: "Item não encontrado no checklist desta pasta." }, { status: 400 });
      let valor: boolean | string;
      if (item.tipo === "marca") {
        if (typeof corpo!.valor !== "boolean") return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
        valor = corpo!.valor;
      } else {
        if (typeof corpo!.valor !== "string") return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
        valor = corpo!.valor.trim().slice(0, 500);
        if (item.tipo === "opcoes" && valor && !item.opcoes?.includes(valor)) {
          return NextResponse.json({ erro: "Opção inválida." }, { status: 400 });
        }
      }
      const resposta: Resposta = { valor, texto: item.rotulo, por: auth.uid, porNome: auth.nome ?? auth.uid, em: agora };
      mudanca.respostas = { [item.chave]: resposta };
    }

    await ref.set({ numero, etapas: { [etapa.codigo]: mudanca }, atualizadoEm: agora }, { merge: true });
    const depois = await ref.get();
    return NextResponse.json({ checklist: { etapas: depois.data()?.etapas ?? {} } });
  } catch (error) {
    return respostaDeErro("checklists/PATCH", error);
  }
}
