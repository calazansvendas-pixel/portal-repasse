// Leitura e gravação do Organograma e dos checklists por pasta (Admin SDK: as coleções não são
// acessíveis direto pelo navegador, então quem marcou e quando vêm sempre do servidor).
import type { Firestore } from "firebase-admin/firestore";
import { ETAPAS_PADRAO, PRACAS_PADRAO } from "@/lib/organograma/padrao";
import { resumirTrajeto } from "@/lib/organograma/calculo";
import { codigoEtapa } from "@/lib/auth/roles";
import { LIMITE_BUSCA } from "@/lib/server/dossieCliente";
import type { ChecklistPastaDoc, DadosOrganograma, EtapaOrganograma, PastaFunil, Praca } from "@/lib/organograma/tipos";
import type { EtapaHistorico, Registro } from "@/lib/types";

export const COLECAO_ETAPAS = "organograma_etapas";
/** Documento das praças, dentro da mesma coleção (os demais ids são códigos de etapa). */
export const DOC_PRACAS = "_pracas";
export const COLECAO_CHECKLISTS = "checklists_clientes";

const porCodigo = (a: EtapaOrganograma, b: EtapaOrganograma) =>
  a.bloco - b.bloco || a.codigo.localeCompare(b.codigo, undefined, { numeric: true });

/**
 * Configuração vigente: o salvo vale sobre a pré-carga. Com `semear`, grava o que ainda não existe
 * usando `create`, que nunca sobrescreve um documento.
 */
export async function lerConfiguracao(db: Firestore, semear: boolean): Promise<{ etapas: EtapaOrganograma[]; pracas: Praca[] }> {
  const snap = await db.collection(COLECAO_ETAPAS).get();
  const salvas = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const pracas = (salvas.get(DOC_PRACAS)?.pracas as Praca[] | undefined) ?? PRACAS_PADRAO;

  if (semear) {
    const faltando: [string, object][] = ETAPAS_PADRAO.filter((e) => !salvas.has(e.codigo)).map((e) => [e.codigo, e]);
    if (!salvas.has(DOC_PRACAS)) faltando.push([DOC_PRACAS, { pracas: PRACAS_PADRAO }]);
    // Outra aba pode semear ao mesmo tempo: o "já existe" é esperado e ignorado.
    await Promise.all(faltando.map(([id, dados]) => db.collection(COLECAO_ETAPAS).doc(id).create(dados).catch(() => undefined)));
  }

  const etapas = new Map(ETAPAS_PADRAO.map((e) => [e.codigo, e]));
  for (const [id, dados] of salvas) if (id !== DOC_PRACAS) etapas.set(id, dados as EtapaOrganograma);
  return { etapas: [...etapas.values()].sort(porCodigo), pracas };
}

type CamposPasta = Pick<Registro, "clienteNome" | "produto" | "cidade" | "etapa" | "dataEntrada"> & { historicoEtapas?: EtapaHistorico[] };

export async function lerFunil(db: Firestore): Promise<Pick<DadosOrganograma, "pastas" | "nomesPlanilha" | "primeiraPlanilha" | "ultimaPlanilha">> {
  const snap = await db
    .collection("registros")
    .select("clienteNome", "produto", "cidade", "etapa", "dataEntrada", "historicoEtapas")
    .limit(LIMITE_BUSCA)
    .get();
  const nomes: Record<string, { data: string; nome: string }> = {};
  let primeira: string | null = null;
  let ultima: string | null = null;
  const anotar = (etapa: string | undefined, data: string) => {
    const codigo = codigoEtapa(etapa ?? "");
    if (codigo && (!nomes[codigo] || data >= nomes[codigo].data)) nomes[codigo] = { data, nome: etapa!.trim() };
  };
  const pastas: PastaFunil[] = snap.docs.map((d) => {
    const r = d.data() as CamposPasta;
    const historico = r.historicoEtapas ?? [];
    for (const h of historico) {
      anotar(h.etapa, h.data);
      if (!primeira || h.data < primeira) primeira = h.data;
      if (!ultima || h.data > ultima) ultima = h.data;
    }
    anotar(r.etapa, "");
    return {
      numero: d.id,
      clienteNome: r.clienteNome ?? "",
      produto: r.produto ?? "",
      cidade: r.cidade ?? "",
      etapa: r.etapa ?? "",
      dataEntrada: r.dataEntrada ?? null,
      trajeto: resumirTrajeto(historico),
    };
  });
  return {
    pastas,
    nomesPlanilha: Object.fromEntries(Object.entries(nomes).map(([c, v]) => [c, v.nome])),
    primeiraPlanilha: primeira,
    ultimaPlanilha: ultima,
  };
}

export async function lerChecklists(db: Firestore): Promise<Record<string, ChecklistPastaDoc>> {
  const snap = await db.collection(COLECAO_CHECKLISTS).limit(LIMITE_BUSCA).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, { etapas: (d.data().etapas ?? {}) as ChecklistPastaDoc["etapas"] }]));
}
