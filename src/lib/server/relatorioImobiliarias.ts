import type { Firestore } from "firebase-admin/firestore";
import type { Registro } from "@/lib/types";

// Teto de leitura: uma única consulta, sem listener em tempo real (mesmo padrão do Analytics).
export const LIMITE_REGISTROS = 3000;

export type PastaRelatorio = Pick<
  Registro,
  | "numero"
  | "clienteNome"
  | "cidade"
  | "produto"
  | "responsavel"
  | "etapa"
  | "prazoEtapa"
  | "observacao"
  | "slaStatus"
  | "dataEntrada"
  | "historicoEtapas"
  | "arquivada"
>;

/** Todas as pastas atuais, para o relatório de prestação de contas às imobiliárias. */
export async function lerPastasParaRelatorio(db: Firestore): Promise<{ pastas: PastaRelatorio[]; truncado: boolean }> {
  const snap = await db
    .collection("registros")
    .select(
      "numero",
      "clienteNome",
      "cidade",
      "produto",
      "responsavel",
      "etapa",
      "prazoEtapa",
      "observacao",
      "slaStatus",
      "dataEntrada",
      "historicoEtapas",
      "arquivada"
    )
    .limit(LIMITE_REGISTROS)
    .get();

  const pastas = snap.docs.map((d) => ({ numero: d.id, ...d.data() }) as PastaRelatorio);
  return { pastas, truncado: snap.size >= LIMITE_REGISTROS };
}
