"use client";

import { ClipboardCheck } from "lucide-react";
import { ChecklistPasta } from "@/components/organograma/ChecklistPasta";
import { useChecklistPasta } from "@/lib/hooks/useOrganograma";
import { diasNaEtapa, progressoDoChecklist, resumirTrajeto, responsavelDoPapel, pracaDaPasta } from "@/lib/organograma/calculo";
import { codigoEtapa } from "@/lib/auth/roles";
import { hojeISO } from "@/lib/utils/dates";
import type { Registro } from "@/lib/types";

/**
 * Checklists da pasta no Dossiê: o da etapa atual aberto e os demais já preenchidos recolhidos,
 * para o Nível 2 enxergar o que o Nível 1 fez sem repetir o trabalho.
 */
export function ChecklistsDoDossie({ registro }: { registro: Registro & { numero: string } }) {
  const { dados, erro, marcar } = useChecklistPasta(registro.numero);
  const atual = codigoEtapa(registro.etapa ?? "");

  if (erro) return <p className="surface-card p-4 text-xs text-status-danger">{erro}</p>;
  if (!dados) return <p className="text-xs text-ink-muted">Carregando checklists…</p>;

  const lista = dados.etapas.filter(
    (e) => e.modalidades.length && (e.codigo === atual || Object.keys(dados.checklist.etapas[e.codigo]?.respostas ?? {}).length)
  );
  if (!lista.length) return null;

  // Aviso de prazo da etapa atual, com quem assume no escalonamento.
  const etapaAtual = dados.etapas.find((e) => e.codigo === atual);
  const tempo = diasNaEtapa(
    {
      numero: registro.numero,
      clienteNome: registro.clienteNome ?? "",
      produto: registro.produto ?? "",
      cidade: registro.cidade,
      etapa: registro.etapa,
      dataEntrada: registro.dataEntrada ?? null,
      trajeto: resumirTrajeto(registro.historicoEtapas ?? []),
    },
    hojeISO()
  );
  const escalonado = etapaAtual?.papeis.find((p) => p.id === etapaAtual.papelEscalonamento);
  const quem = escalonado ? responsavelDoPapel(escalonado, pracaDaPasta(registro, dados.pracas)) : "";
  const estourado = etapaAtual?.slaDias != null && tempo && tempo.dias >= etapaAtual.slaDias;

  return (
    <div data-checklists className="surface-card flex flex-col gap-3 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink-primary dark:text-white">
        <ClipboardCheck size={16} className="text-brand-primary" />
        Checklists da pasta
      </h3>
      {estourado && (
        <p className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs font-semibold text-status-danger">
          {tempo.dias} dias na etapa {atual} (prazo de {etapaAtual.slaDias}).
          {quem && ` Escalonamento: ${quem}.`}
        </p>
      )}
      {lista.map((etapa) => {
        const marcado = dados.checklist.etapas[etapa.codigo];
        const { feitos, total } = progressoDoChecklist(etapa, marcado);
        return (
          <details key={etapa.codigo} open={etapa.codigo === atual} className="rounded-md border border-border dark:border-white/10">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-xs font-semibold text-ink-primary dark:text-white">
              {etapa.codigo} · {etapa.nome}
              {etapa.codigo === atual && <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] text-white">Etapa atual</span>}
              <span className="ml-auto tabular-nums text-ink-muted">
                {feitos} de {total}
              </span>
            </summary>
            <div className="border-t border-border p-3 dark:border-white/10">
              <ChecklistPasta etapa={etapa} marcado={marcado} onMudar={(m) => marcar(etapa.codigo, m)} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
