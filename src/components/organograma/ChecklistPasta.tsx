"use client";

import { useState } from "react";
import { Interruptor } from "@/components/admin/ui";
import { itensDoChecklist, modalidadeEscolhida, type ItemExpandido } from "@/lib/organograma/calculo";
import type { ChecklistEtapa, EtapaOrganograma } from "@/lib/organograma/tipos";
import type { MudancaChecklist } from "@/lib/hooks/useOrganograma";
import { formatDateTimeBR } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

/** Checklist de uma pasta em uma etapa: cada marcação é salva na hora, com autor e horário. */
export function ChecklistPasta({
  etapa,
  marcado,
  onMudar,
}: {
  etapa: EtapaOrganograma;
  marcado: ChecklistEtapa | undefined;
  onMudar: (mudanca: MudancaChecklist) => Promise<string | null>;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const modalidade = modalidadeEscolhida(etapa, marcado);
  const itens = itensDoChecklist(etapa, marcado);
  const feitos = itens.filter((i) => !!marcado?.respostas?.[i.chave]?.valor).length;

  async function mudar(chave: string, mudanca: MudancaChecklist) {
    setSalvando(chave);
    setErro(await onMudar(mudanca));
    setSalvando(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {etapa.modalidades.length > 1 ? (
          <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-ink-secondary dark:text-white/70">
            Modalidade
            <select
              className="input-field !h-9 min-w-0"
              value={modalidade?.id ?? ""}
              disabled={!!salvando}
              onChange={(e) => mudar("modalidade", { modalidadeId: e.target.value })}
            >
              {etapa.modalidades.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs font-semibold text-ink-secondary dark:text-white/70">{modalidade?.nome}</p>
        )}
        {etapa.permiteCasal && (
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-secondary dark:text-white/70">
            Casal / 2º Proponente
            <Interruptor rotulo="Casal / 2º Proponente" ligado={!!marcado?.casal} desabilitado={!!salvando} onChange={(casal) => mudar("casal", { casal })} />
          </span>
        )}
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", feitos === itens.length ? "bg-status-success/10 text-status-success" : "bg-brand-100 text-brand-900")}>
          {feitos} de {itens.length}
        </span>
      </div>

      {erro && <p className="rounded-md bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{erro}</p>}

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border dark:divide-white/10 dark:border-white/10">
        {itens.map((item) => (
          <Linha key={item.chave} item={item} marcado={marcado} ocupado={salvando === item.chave} onMudar={(valor) => mudar(item.chave, { item: item.chave, valor })} />
        ))}
        {!itens.length && <li className="p-3 text-xs text-ink-muted">Nenhum item nesta modalidade. Edite a etapa para incluir.</li>}
      </ul>
    </div>
  );
}

function Linha({
  item,
  marcado,
  ocupado,
  onMudar,
}: {
  item: ItemExpandido;
  marcado: ChecklistEtapa | undefined;
  ocupado: boolean;
  onMudar: (valor: boolean | string) => void;
}) {
  const resposta = marcado?.respostas?.[item.chave];
  const valorTexto = typeof resposta?.valor === "string" ? resposta.valor : "";
  const registro = resposta && (
    <span className="block text-[11px] text-ink-muted">
      {resposta.valor ? "Marcado" : "Desmarcado"} por {resposta.porNome} em {formatDateTimeBR(resposta.em)}
    </span>
  );

  return (
    <li className={cn("px-3 py-2.5 text-xs text-ink-primary dark:text-white", ocupado && "opacity-60")}>
      {item.tipo === "marca" ? (
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary" checked={resposta?.valor === true} disabled={ocupado} onChange={(e) => onMudar(e.target.checked)} />
          <span className="min-w-0 break-words">
            {item.rotulo}
            {registro}
          </span>
        </label>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="break-words">{item.rotulo}</span>
          {item.tipo === "opcoes" ? (
            <select className="input-field !h-9" value={valorTexto} disabled={ocupado} onChange={(e) => onMudar(e.target.value)}>
              <option value="">Selecione</option>
              {item.opcoes?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            // Salva ao sair do campo; a chave recria o campo quando chega um valor novo do servidor.
            <input
              key={valorTexto}
              className="input-field !h-9"
              maxLength={500}
              defaultValue={valorTexto}
              disabled={ocupado}
              onBlur={(e) => e.target.value.trim() !== valorTexto && onMudar(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          )}
          {registro}
        </label>
      )}
    </li>
  );
}
