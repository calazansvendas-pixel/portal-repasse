"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  LogIn,
  Search,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeVerDossieCliente, resolvePracaPorCidade } from "@/lib/auth/roles";
import { useDossieCliente } from "@/lib/hooks/useDossieCliente";
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
  const podeVer = !!profile && podeVerDossieCliente(profile.role);
  const { candidatos, dossie, loading, erro, buscar, abrir, limpar } = useDossieCliente();
  const [termo, setTermo] = useState("");

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Dossiê do Cliente" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  function handleBuscar(e: FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 3) return;
    buscar(termo);
  }

  const eventos = dossie ? montarLinhaDoTempo(dossie.registro, dossie.tarefas) : [];
  const praca = dossie ? resolvePracaPorCidade(dossie.registro.cidade) : null;

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Dossiê do Cliente" />
      <p className="text-sm text-ink-secondary dark:text-white/60">
        Consulta somente leitura: linha do tempo completa de uma pasta — histórico de etapas da planilha, tarefas
        abertas pelo motor de regras e as ações humanas registradas em cada uma.
      </p>

      <form onSubmit={handleBuscar} className="surface-card flex flex-wrap items-end gap-3 p-3 sm:gap-4 sm:p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[320px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Nome ou CPF/CNPJ</span>
          <input
            type="text"
            className="input-field"
            placeholder="Ex.: Jorge Luiz Gomes Moreira ou 123.456.789-00"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary flex h-11 items-center gap-2 px-5" disabled={loading}>
          <Search size={16} />
          Buscar
        </button>
        {(dossie || candidatos.length > 0) && (
          <button
            type="button"
            onClick={() => {
              limpar();
              setTermo("");
            }}
            className="flex h-11 items-center gap-2 px-3 text-sm text-ink-muted transition-colors hover:text-ink-primary dark:hover:text-white"
          >
            <X size={16} />
            Limpar
          </button>
        )}
      </form>

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{erro}</p>
        </div>
      )}

      {loading && <p className="text-sm text-ink-muted">Carregando…</p>}

      {!loading && !dossie && candidatos.length > 0 && (
        <div className="surface-card flex flex-col divide-y divide-border p-0 dark:divide-white/10">
          {candidatos.map((c) => (
            <button
              key={c.numero}
              type="button"
              onClick={() => abrir(c.numero)}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-soft dark:hover:bg-white/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-primary dark:text-white">
                  {c.clienteNome || `Pasta ${c.numero}`}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  Pasta {c.numero} · {c.cpfCnpj || "CPF não informado"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-secondary dark:text-white/60">Etapa {c.etapa || "—"}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && !dossie && candidatos.length === 0 && !erro && (
        <div className="surface-card p-8 text-center text-sm text-ink-muted">
          Busque por nome ou CPF/CNPJ para abrir o dossiê de uma pasta.
        </div>
      )}

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
