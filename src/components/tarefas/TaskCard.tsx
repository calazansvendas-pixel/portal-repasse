"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Layers, Pencil, Trash2, Undo2 } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import {
  alternarClienteEnvolvido,
  excluirTarefa,
  marcarFeitaPelaGerencia,
  marcarTarefaResolvida,
  reverterTarefa,
} from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { meuQuadroInterativo } from "@/lib/auth/roles";
import { formatDateBR, hojeISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { ConfirmarExclusaoModal, DetalhesTarefaModal, NotaConclusaoModal } from "./ModaisTarefa";
import { MenuTarefa, type ItemMenu } from "./MenuTarefa";
import { NovaTarefaModal } from "./NovaTarefaModal";
import { ListaClientesEnvolvidos } from "./ClientesEnvolvidos";
import { ObservacaoChecklist, TrajetoPasta, dataUltimaPlanilha } from "./partesCard";

const PRACAS_ASSISTENTES: Tarefa["praca"][] = ["laiza", "eliane", "catarina"];

export function TaskCard({ tarefa, somenteLeitura = false }: { tarefa: Tarefa; somenteLeitura?: boolean }) {
  const { firebaseUser, profile } = useAuth();
  const [modal, setModal] = useState<"nota" | "detalhes" | "editar" | "excluir" | null>(null);
  // Número do cliente cujo check completa a tarefa agregada (pede a nota opcional antes de gravar).
  const [clientePendente, setClientePendente] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  const aguardandoValidacao = tarefa.status === "pending_validation";
  const falhaAuditoria = tarefa.status === "audit_failed";
  const isAgregado = tarefa.origem === "agregado";
  const isManual = tarefa.origem === "manual";
  const clientes = tarefa.clientesEnvolvidos ?? [];
  const temSubtarefas = isAgregado && clientes.length > 0;
  const totalPastas = clientes.length || tarefa.numerosRelacionados?.length || 0;
  const concluidos = clientes.filter((c) => c.concluido).length;
  // Tarefa agregada: a última planilha em que qualquer uma das pastas apareceu.
  const ultimaPlanilhaAgregado =
    clientes
      .map((c) => dataUltimaPlanilha(c.historicoEtapas))
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null;

  const ehGerencia = profile?.role === "gerencia";
  const criadorDaAvulsa = isManual && !!firebaseUser && tarefa.criadaPor === firebaseUser.uid;
  const podeEditarExcluir = ehGerencia || criadorDaAvulsa;
  // Reverter: Gerência (God Mode), o dono do quadro (clique por engano) ou a gestão auditando cards das assistentes.
  const podeReverter =
    !!profile &&
    (ehGerencia ||
      meuQuadroInterativo(profile).includes(tarefa.praca) ||
      (["coordenador", "analista"].includes(profile.role) && PRACAS_ASSISTENTES.includes(tarefa.praca)));

  const tituloAgregado = `${tarefa.tipoPendencia.startsWith("Gargalo") ? "Gargalo detectado" : tarefa.tipoPendencia}: ${totalPastas} pastas`;
  const dataLimiteVencida = !!tarefa.dataLimite && tarefa.dataLimite < hojeISO();

  const itensMenu: ItemMenu[] = [];
  if (podeEditarExcluir) itensMenu.push({ rotulo: "Editar", icone: Pencil, onClick: () => setModal("editar") });
  if (ehGerencia && !aguardandoValidacao) {
    itensMenu.push({
      rotulo: "Marcar como feita",
      icone: CheckCircle2,
      onClick: () => firebaseUser && marcarFeitaPelaGerencia(tarefa, firebaseUser.uid),
    });
  }
  if (ehGerencia && aguardandoValidacao) {
    itensMenu.push({ rotulo: "Voltar para ativa", icone: Undo2, onClick: () => reverterTarefa(tarefa) });
  }
  if (podeEditarExcluir) itensMenu.push({ rotulo: "Excluir", icone: Trash2, onClick: () => setModal("excluir"), perigo: true });

  async function confirmarConclusao(nota: string) {
    if (!firebaseUser) return;
    await marcarTarefaResolvida(tarefa, firebaseUser.uid, nota);
    setModal(null);
  }

  async function alternarCliente(numero: string) {
    if (!firebaseUser) return;
    const cliente = clientes.find((c) => c.numero === numero);
    if (!cliente) return;
    const completaATarefa = !cliente.concluido && clientes.filter((c) => !c.concluido).length === 1;
    if (completaATarefa) setClientePendente(numero);
    else await alternarClienteEnvolvido(tarefa.id, numero, firebaseUser.uid);
  }

  async function confirmarClientePendente(nota: string) {
    if (!firebaseUser || !clientePendente) return;
    await alternarClienteEnvolvido(tarefa.id, clientePendente, firebaseUser.uid, nota);
    setClientePendente(null);
  }

  async function reverter() {
    await reverterTarefa(tarefa);
    setModal(null);
  }

  async function excluir() {
    if (!firebaseUser) return;
    await excluirTarefa(tarefa.id, await firebaseUser.getIdToken());
    setModal(null);
  }

  if (aguardandoValidacao) {
    const nome = isManual
      ? tarefa.descricao
      : isAgregado
        ? tituloAgregado
        : tarefa.clienteNome || tarefa.imobiliaria || tarefa.tipoPendencia;
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setModal("detalhes")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setModal("detalhes")}
          className="surface-card flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-shadow hover:shadow-md"
        >
          <p className="truncate text-sm font-semibold text-ink-primary dark:text-white">{nome}</p>
          <div className="flex shrink-0 items-center gap-1">
            {itensMenu.length > 0 && <MenuTarefa itens={itensMenu} />}
            <span className="rounded-full bg-status-success/15 p-1.5 text-status-success">
              <Check size={20} strokeWidth={3} />
            </span>
          </div>
        </div>
        {modal === "detalhes" && (
          <DetalhesTarefaModal
            tarefa={tarefa}
            podeReverter={podeReverter}
            onReverter={reverter}
            onFechar={() => setModal(null)}
          />
        )}
        {modal === "editar" && <NovaTarefaModal tarefa={tarefa} onFechar={() => setModal(null)} />}
        {modal === "excluir" && <ConfirmarExclusaoModal onConfirmar={excluir} onCancelar={() => setModal(null)} />}
      </>
    );
  }

  return (
    <div
      className={cn(
        "surface-card space-y-3 p-4",
        falhaAuditoria && "border-status-danger/50 bg-status-danger/5"
      )}
    >
      {falhaAuditoria && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-status-danger">
          <AlertTriangle size={14} />
          Falha de Auditoria
        </div>
      )}
      {falhaAuditoria && tarefa.falhaAuditoriaMotivo && (
        <p className="text-xs text-status-danger">{tarefa.falhaAuditoriaMotivo}</p>
      )}

      {/* Cabeçalho: cliente + imobiliária | solicitação interna | gargalo (sanfona) */}
      <div className="flex items-start justify-between gap-2">
        {isManual ? (
          <div>
            <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">Solicitação Interna</p>
            <p className="text-xs text-ink-muted">Enviado por: {tarefa.criadaPorNome || "—"}</p>
          </div>
        ) : isAgregado ? (
          temSubtarefas ? (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              aria-expanded={expandido}
              className="flex items-start gap-1.5 text-left"
            >
              <span className="mt-0.5 shrink-0">{expandido ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              <span>
                <span className="block text-sm font-semibold leading-snug text-ink-primary dark:text-white">
                  {tituloAgregado}{" "}
                  <span className="text-xs font-normal text-ink-muted">
                    ({concluidos}/{clientes.length})
                  </span>
                </span>
                {tarefa.etapa && <span className="block text-xs text-ink-muted">Etapa {tarefa.etapa}</span>}
              </span>
            </button>
          ) : (
            <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">{tituloAgregado}</p>
          )
        ) : (
          <div>
            <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">
              {tarefa.clienteNome || "Cliente não identificado"}
            </p>
            <p className="text-xs text-ink-muted">{tarefa.imobiliaria || "Imobiliária não informada"}</p>
          </div>
        )}
        {itensMenu.length > 0 && <MenuTarefa itens={itensMenu} />}
      </div>

      {/* Corpo 1: ação de consultoria/ajuda */}
      <p className="whitespace-pre-line text-sm font-medium leading-snug text-ink-primary dark:text-white">
        {tarefa.descricao}
      </p>

      {tarefa.dataLimite && (
        <p className={cn("text-xs", dataLimiteVencida ? "font-semibold text-status-danger" : "text-ink-muted")}>
          Realizar até: {formatDateBR(tarefa.dataLimite)}
          {dataLimiteVencida && " (atrasada)"}
        </p>
      )}

      {/* Sub-tarefas do gargalo: um check por cliente */}
      {temSubtarefas && expandido && (
        <ListaClientesEnvolvidos clientes={clientes} podeMarcar={!somenteLeitura} onAlternar={alternarCliente} />
      )}

      {/* Corpo 2: o problema, em checklist, para apoiar a ligação */}
      {tarefa.observacaoOriginal && (
        <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            O que foi relatado
          </p>
          <ObservacaoChecklist texto={tarefa.observacaoOriginal} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {!isManual && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SLA_BADGE_CLASSES[tarefa.slaStatus])}>
            {SLA_LABEL[tarefa.slaStatus]}
          </span>
        )}
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary dark:border-white/15 dark:text-white/60">
          {tarefa.tipoPendencia}
        </span>
        {tarefa.cicloFollowUp && (
          <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary dark:bg-white/10 dark:text-white/80">
            Ciclo {tarefa.cicloFollowUp} de 4
          </span>
        )}
      </div>

      {/* Rodapé: trajeto da pasta (stepper vertical) ou pastas relacionadas em agregados */}
      <div className="border-t border-border pt-3 dark:border-white/10">
        {isAgregado ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <Layers size={12} />
            {totalPastas} pastas relacionadas
            {ultimaPlanilhaAgregado && <> · Última planilha importada: {formatDateBR(ultimaPlanilhaAgregado)}</>}
          </span>
        ) : isManual ? (
          <span className="text-xs text-ink-muted">Criada em {formatDateBR(tarefa.criadoEm)}</span>
        ) : (
          <TrajetoPasta dados={tarefa} />
        )}

        {!somenteLeitura && !temSubtarefas && (
          <button
            type="button"
            onClick={() => setModal("nota")}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/10 px-2.5 py-1.5 text-xs font-semibold text-status-success transition-colors hover:bg-status-success/15"
          >
            <Check size={14} />
            Marcar como resolvida
          </button>
        )}
      </div>

      {modal === "editar" && <NovaTarefaModal tarefa={tarefa} onFechar={() => setModal(null)} />}
      {modal === "excluir" && <ConfirmarExclusaoModal onConfirmar={excluir} onCancelar={() => setModal(null)} />}
      {modal === "nota" && <NotaConclusaoModal onConfirmar={confirmarConclusao} onCancelar={() => setModal(null)} />}
      {clientePendente && (
        <NotaConclusaoModal onConfirmar={confirmarClientePendente} onCancelar={() => setClientePendente(null)} />
      )}
    </div>
  );
}
