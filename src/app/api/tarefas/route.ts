import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Tarefa } from "@/lib/types";
import { NIVEL_POR_QUADRO, autenticar, validarDescricaoEDestino } from "@/lib/server/tarefasManuais";

export const runtime = "nodejs";

/**
 * Cria uma Tarefa Avulsa (origem "manual"): demanda interna delegada de cima
 * para baixo, sem relação com a planilha. A hierarquia de destinatários é
 * validada aqui, no servidor (o client SDK não pode criar tarefas).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const body = (await req.json().catch(() => null)) as { descricao?: unknown; atribuidoPara?: unknown } | null;
    const valido = validarDescricaoEDestino(auth.role, body?.descricao, body?.atribuidoPara);
    if (valido instanceof NextResponse) return valido;

    const agora = new Date().toISOString();
    const ref = getAdminDb().collection("tarefas").doc();
    const tarefa: Omit<Tarefa, "id"> = {
      chaveRegra: `MANUAL::${ref.id}`,
      origem: "manual",
      nivel: NIVEL_POR_QUADRO[valido.atribuidoPara],
      numero: null,
      numerosRelacionados: null,
      clienteNome: null,
      dataEntrada: null,
      cidade: "",
      praca: valido.atribuidoPara,
      imobiliaria: "",
      etapa: "",
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: "Tarefa avulsa",
      descricao: valido.descricao,
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
      criadaPor: auth.uid,
      criadaPorNome: auth.nome,
    };
    await ref.set(tarefa);

    return NextResponse.json({ id: ref.id });
  } catch (error) {
    console.error("[tarefas/POST] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao criar a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
