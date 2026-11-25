"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LogIn,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { temPermissao } from "@/lib/auth/cargos";
import { temMenu } from "@/lib/auth/menus";
import { resolvePracaPorCidade } from "@/lib/auth/roles";
import { useBaseDossie, useDossieCliente } from "@/lib/hooks/useDossieCliente";
import { SuperfiltrosDossie } from "@/components/auditoria/SuperfiltrosDossie";
import { useMapeamentoPracas } from "@/lib/hooks/useMapeamentoPracas";
import { Topbar } from "@/components/layout/Topbar";
import { montarLinhaDoTempo } from "@/lib/utils/dossieTimeline";
import type { EventoDossie, TipoEventoDossie } from "@/lib/utils/dossieTimeline";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import { ASSISTENTE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const ICONE_EVENTO: Record<TipoEventoDossie, typeof LogIn> = {
  entrada: LogIn,
  planilha: FileSpreadsheet,
  tarefa: ClipboardList,
  acao: CheckCircle2,
};

/** Data-only (yyyy-MM-dd) x data-hora (ISO completo): a linha do tempo mistura as duas fontes. */
function formatarDataEvento(data: string): string {
  return data.length === 10 ? formatDateBR(data) : formatDateTimeBR(data);
}

export default function DossieClientePage() {
  const { profile } = useAuth();
  const podeVer = !!profile && temMenu(profile, "dossie");
  const { dossie, loading, erro, abrir, limpar } = useDossieCliente();
  const base = useBaseDossie(podeVer);
  const { overrides: pracaOverrides } = useMapeamentoPracas();

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Dossiê do Cliente" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  const eventos = dossie ? montarLinhaDoTempo(dossie.registro, dossie.tarefas) : [];
  const praca = dossie ? resolvePracaPorCidade(dossie.registro.cidade, pracaOverrides) : null;

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Dossiê do Cliente" />
      <p className="text-sm text-ink-secondary dark:text-white/60">
        Consulta somente leitura: linha do tempo completa de uma pasta — histórico de etapas da planilha, tarefas
        abertas pelo motor de regras e as ações humanas registradas em cada uma.
      </p>

      <SuperfiltrosDossie
        base={base}
        podeExportar={temPermissao(profile, "exportarRelatorios")}
        carregando={base.carregando}
        erro={base.erro}
        onRecarregar={base.recarregar}
        onAbrir={abrir}
        onFechar={limpar}
      >
      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{erro}</p>
        </div>
      )}

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      {dossie && (
        <div className="flex flex-col gap-5">
          <div className="surface-card flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <User size={18} className="shrink-0 text-brand-primary" />
              <h2 className="truncate text-base font-bold text-ink-primary dark:text-white">
                {dossie.registro.clienteNome || `Pasta ${dossie.registro.numero}`}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-ink-secondary sm:grid-cols-2 lg:grid-cols-3 dark:text-white/60">
              <Campo label="Pasta" valor={dossie.registro.numero} />
              <Campo label="CPF/CNPJ" valor={dossie.registro.cpfCnpj || "—"} />
              <Campo label="Empreendimento" valor={dossie.registro.produto || "—"} />
              <Campo label="Imobiliária" valor={dossie.registro.responsavel || "—"} />
              <Campo label="Assistente/Praça" valor={praca ? ASSISTENTE_LABEL[praca] : "—"} />
              <Campo label="Etapa atual" valor={dossie.registro.etapa || "—"} />
            </div>
          </div>

          <div className="surface-card p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-bold text-ink-primary dark:text-white">Linha do tempo</h3>
            {eventos.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum evento registrado para esta pasta ainda.</p>
            ) : (
              <ol className="flex flex-col gap-0">
                {eventos.map((evento, i) => (
                  <EventoLinha key={i} evento={evento} ultimo={i === eventos.length - 1} />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      </SuperfiltrosDossie>
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="min-w-0 truncate">
      <span className="text-ink-muted">{label}:</span> {valor}
    </p>
  );
}

function EventoLinha({ evento, ultimo }: { evento: EventoDossie; ultimo: boolean }) {
  const Icone = ICONE_EVENTO[evento.tipo];
  const destaque = evento.tipo === "acao";
  const aninhado = evento.nivel === 1;
  return (
    <li className={cn("flex gap-3", aninhado && "ml-5 border-l-2 border-dashed border-border pl-3 dark:border-white/15")}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full",
            aninhado ? "h-6 w-6" : "h-7 w-7",
            destaque ? "bg-status-success/15 text-status-success" : "bg-surface-soft text-ink-muted dark:bg-white/10"
          )}
        >
          <Icone size={aninhado ? 12 : 14} />
        </span>
        {!ultimo && <span className="w-px flex-1 bg-border dark:bg-white/15" />}
      </div>
      <div className={cn("min-w-0 flex-1", !ultimo && "pb-4")}>
        <div className="flex flex-wrap items-center gap-2">
          {aninhado && <span className="text-ink-muted">↳</span>}
          <p className="text-sm font-semibold text-ink-primary dark:text-white">{evento.titulo}</p>
          {[...(evento.badge ? [evento.badge] : []), ...(evento.badges ?? [])].map((b, i) => (
            <span key={i} className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", b.classes)}>
              {b.label}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-ink-muted">{formatarDataEvento(evento.data)}</p>
        {evento.detalhe && (
          <p className="mt-1 whitespace-pre-line break-words text-xs text-ink-secondary dark:text-white/70">
            {evento.detalhe}
          </p>
        )}
      </div>
    </li>
  );
}
