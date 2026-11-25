import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { temPermissao } from "@/lib/auth/cargos";
import { temMenu } from "@/lib/auth/menus";
import { autenticar } from "@/lib/server/tarefasManuais";
import { COLECAO_ETAPAS, DOC_PRACAS, lerChecklists, lerConfiguracao, lerFunil } from "@/lib/server/organograma";
import { respostaDeErro } from "@/lib/server/usuarios";
import { lerEtapa, lerPracas } from "@/lib/organograma/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negado = (erro: string) => NextResponse.json({ erro }, { status: 403 });

/** Configuração, funil das planilhas e checklists marcados. */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!temMenu(auth.perfil, "organograma")) return negado("Seu perfil não tem acesso ao Organograma.");
    const podeEditar = temPermissao(auth.perfil, "editarParametros");
    const db = getAdminDb();
    const [config, funil, checklists] = await Promise.all([lerConfiguracao(db, podeEditar), lerFunil(db), lerChecklists(db)]);
    return NextResponse.json({ ...config, ...funil, checklists, podeEditar });
  } catch (error) {
    return respostaDeErro("organograma/GET", error);
  }
}

/** Salva uma etapa ou a lista de praças (permissão "Editar Parâmetros"). */
export async function PUT(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!temMenu(auth.perfil, "organograma") || !temPermissao(auth.perfil, "editarParametros")) {
      return negado('Editar o Organograma exige a permissão "Editar Parâmetros".');
    }
    const corpo = (await req.json().catch(() => null)) as { etapa?: unknown; pracas?: unknown } | null;
    const carimbo = { atualizadoEm: new Date().toISOString(), atualizadoPor: auth.uid, atualizadoPorNome: auth.nome ?? "" };
    const colecao = getAdminDb().collection(COLECAO_ETAPAS);

    if (corpo?.pracas !== undefined) {
      const pracas = lerPracas(corpo.pracas);
      if (typeof pracas === "string") return NextResponse.json({ erro: pracas }, { status: 400 });
      await colecao.doc(DOC_PRACAS).set({ pracas, ...carimbo });
    } else {
      const etapa = lerEtapa(corpo?.etapa);
      if (typeof etapa === "string") return NextResponse.json({ erro: etapa }, { status: 400 });
      await colecao.doc(etapa.codigo).set({ ...etapa, ...carimbo });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro("organograma/PUT", error);
  }
}
