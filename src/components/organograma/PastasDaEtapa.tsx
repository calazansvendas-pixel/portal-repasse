"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Botao } from "@/components/admin/ui";
import { ChecklistPasta } from "@/components/organograma/ChecklistPasta";
import { diasNaEtapa, pracaDaPasta, progressoDoChecklist, responsavelDoPapel } from "@/lib/organograma/calculo";
import type { MudancaChecklist } from "@/lib/hooks/useOrganograma";
import type { ChecklistPastaDoc, EtapaOrganograma, PastaFunil } from "@/lib/organograma/tipos";
import type { Praca } from "@/lib/organograma/tipos";
import { normalize } from "@/lib/auth/roles";
import { formatDateBR, hojeISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

/** Pastas paradas na etapa, das mais antigas para as mais novas, com o checklist de cada uma. */
export function PastasDaEtapa({
  etapa,
  paradas,
  checklists,
  pracas,
  nomeDaPraca,
  onMarcar,
  onFechar,
}: {
  etapa: EtapaOrganograma;
  paradas: PastaFunil[];
  checklists: Record<string, ChecklistPastaDoc>;
  pracas: Praca[];
  nomeDaPraca: (id: string) => string;
  onMarcar: (numero: string, mudanca: MudancaChecklist) => Promise<string | null>;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const hoje = hojeISO();
  const termo = normalize(busca);
  const linhas = paradas
    .map((pasta) => ({ pasta, tempo: diasNaEtapa(pasta, hoje), praca: pracaDaPasta(pasta, pracas) }))
    .filter((l) => !termo || normalize(`${l.pasta.clienteNome} ${l.pasta.numero} ${l.pasta.produto}`).includes(termo))
    .sort((a, b) => (b.tempo?.dias ?? -1) - (a.tempo?.dias ?? -1) || a.pasta.clienteNome.localeCompare(b.pasta.clienteNome, "pt-BR"));
  const escalonado = etapa.papeis.find((p) => p.id === etapa.papelEscalonamento);

  return (
    <Modal titulo={`${etapa.codigo} · ${etapa.nome}`} onClose={onFechar} largo>
      <div className="flex flex-col gap-3">
        <input className="input-field" placeholder="Buscar por cliente, pasta ou empreendimento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="flex flex-col gap-2">
          {linhas.map(({ pasta, tempo, praca }) => {
            const marcado = checklists[pasta.numero]?.etapas[etapa.codigo];
            const progresso = progressoDoChecklist(etapa, marcado);
            const estourado = etapa.slaDias != null && !!tempo && tempo.dias >= etapa.slaDias;
            const quem = estourado && escalonado ? responsavelDoPapel(escalonado, praca) : "";
            const expandida = aberta === pasta.numero;
            const temChecklist = etapa.modalidades.length > 0;
            return (
              <li key={pasta.numero} className={cn("rounded-md border border-border dark:border-white/10", estourado && "!border-status-danger/40")}>
                <button
                  type="button"
                  aria-expanded={expandida}
                  disabled={!temChecklist}
                  onClick={() => setAberta(expandida ? null : pasta.numero)}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium text-ink-primary dark:text-white">{pasta.clienteNome || `Pasta ${pasta.numero}`}</span>
                    <span className="block break-words text-[11px] text-ink-muted">
                      {[pasta.produto, nomeDaPraca(praca)].filter(Boolean).join(" · ")}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={cn("rounded-full px-2 py-0.5 font-bold", estourado ? "bg-status-danger/10 text-status-danger" : "bg-surface-soft text-ink-secondary dark:bg-white/10 dark:text-white/70")}>
                        {tempo ? `${tempo.dias} dia${tempo.dias === 1 ? "" : "s"} (desde ${formatDateBR(tempo.desde)})` : "Sem data de entrada"}
                      </span>
                      {quem && <span className="rounded-full bg-status-danger px-2 py-0.5 font-bold text-white">Escalonado: {quem}</span>}
                      {temChecklist && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold tabular-nums text-brand-900">
                          Checklist {progresso.feitos}/{progresso.total}
                        </span>
                      )}
                    </span>
                  </span>
                  {temChecklist && <ChevronDown size={16} className={cn("mt-1 shrink-0 text-ink-muted transition-transform", expandida && "rotate-180")} />}
                </button>
                {expandida && (
                  <div className="border-t border-border p-3 dark:border-white/10">
                    <ChecklistPasta etapa={etapa} marcado={marcado} onMudar={(m) => onMarcar(pasta.numero, m)} />
                  </div>
                )}
              </li>
            );
          })}
          {!linhas.length && <li className="p-4 text-center text-sm text-ink-muted">Nenhuma pasta encontrada.</li>}
        </ul>
        <div className="flex justify-end">
          <Botao onClick={onFechar}>Fechar</Botao>
        </div>
      </div>
    </Modal>
  );
}
