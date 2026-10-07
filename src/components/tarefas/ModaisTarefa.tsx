"use client";

import { useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import type { Assistente, ClienteEnvolvido, Quadro, Role, Tarefa } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils/dates";
import { Modal } from "@/components/ui/Modal";
import { PRACAS_FILTRO_UI, resolvePracaPorCidade, type PracaOverrides } from "@/lib/auth/roles";
import type { DestinoResponsavelCustomizado } from "@/lib/services/tarefasService";
import { ListaClientesEnvolvidos } from "./ClientesEnvolvidos";
import { HistoricoNotas, ObservacaoChecklist, TrajetoPasta, notasDe } from "./partesCard";

export interface ColaboradorSelecionavel {
  uid: string;
  nome: string;
  role: Role;
  praca?: Assistente;
}

const AUTOMATICO = "automatico";

/** Quadro/coluna do colaborador — null (Gerência) não entra na lista, pois não tem coluna no painel. */
function quadroDoColaborador(c: ColaboradorSelecionavel): Quadro | null {
  if (c.role === "assistente") return c.praca ?? null;
  if (c.role === "coordenador") return "coordenador";
  if (c.role === "analista") return "analista";
  return null;
}

const CARGO_LABEL: Record<Role, string> = {
  assistente: "Assistente",
  analista: "Analista",
  coordenador: "Coordenação",
  gerencia: "Gerência",
};

/**
 * Override manual de responsável, visível dentro do modal de detalhes (Gerência) — não mais
 * escondido só no menu de 3 pontos. "Praça/Cidade" escolhe o grupo geográfico e resolve o
 * colaborador que cobre esse grupo HOJE (via Mapeamento de Praças); "Responsável" fixa uma pessoa
 * diretamente, ignorando a cidade. As duas opções terminam no mesmo override — a diferença é só o
 * caminho para chegar lá. "Automático" nos dois volta a tarefa para a hierarquia normal.
 */
function SecaoResponsavel({
  tarefa,
  colaboradores,
  pracaOverrides,
  onAlterar,
}: {
  tarefa: Tarefa;
  colaboradores: ColaboradorSelecionavel[];
  pracaOverrides?: PracaOverrides | null;
  onAlterar: (destino: DestinoResponsavelCustomizado | null) => Promise<void>;
}) {
  const selecionaveis = colaboradores.filter((c) => quadroDoColaborador(c) !== null);

  // Praça só pode ser inferida de volta a partir do responsável atual quando ele é mesmo um dos 3
  // assistentes regionais — Coordenação/Analista nunca têm uma "praça/cidade" própria.
  const colaboradorAtual = selecionaveis.find((c) => c.uid === tarefa.responsavelCustomizadoId);
  const pracaInicial =
    colaboradorAtual?.role === "assistente" ? PRACAS_FILTRO_UI.find((p) => p.praca === colaboradorAtual.praca)?.praca ?? AUTOMATICO : AUTOMATICO;

  const [praca, setPraca] = useState<string>(pracaInicial);
  const [responsavel, setResponsavel] = useState(tarefa.responsavelCustomizadoId ?? AUTOMATICO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function escolherPraca(valor: string) {
    setPraca(valor);
    if (valor === AUTOMATICO) {
      setResponsavel(AUTOMATICO);
      return;
    }
    // Resolve quem cobre esse grupo HOJE (Mapeamento de Praças global) e já reflete no campo
    // Responsável — ambos os campos descrevem o MESMO override, só por caminhos diferentes.
    const grupo = PRACAS_FILTRO_UI.find((p) => p.praca === valor);
    const assistenteResolvido = grupo ? resolvePracaPorCidade(grupo.label, pracaOverrides) : null;
    const colaborador = selecionaveis.find((c) => c.role === "assistente" && c.praca === assistenteResolvido);
    setResponsavel(colaborador?.uid ?? AUTOMATICO);
  }

  function escolherResponsavel(valor: string) {
    setResponsavel(valor);
    setPraca(AUTOMATICO); // escolha direta de pessoa não passa mais pela praça
  }

  const alterado = responsavel !== (tarefa.responsavelCustomizadoId ?? AUTOMATICO);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (responsavel === AUTOMATICO) {
        await onAlterar(null);
        return;
      }
      const colaborador = selecionaveis.find((c) => c.uid === responsavel);
      const quadro = colaborador && quadroDoColaborador(colaborador);
      if (!colaborador || !quadro) return;
      await onAlterar({ uid: colaborador.uid, nome: colaborador.nome, quadro });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao alterar o responsável.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Secao titulo="Responsável">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-secondary dark:text-white/70">Praça / Cidade</span>
          <select className="input-field" value={praca} onChange={(e) => escolherPraca(e.target.value)}>
            <option value={AUTOMATICO}>Automático</option>
            {PRACAS_FILTRO_UI.map((p) => (
              <option key={p.praca} value={p.praca}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-ink-secondary dark:text-white/70">Responsável</span>
          <select className="input-field" value={responsavel} onChange={(e) => escolherResponsavel(e.target.value)}>
            <option value={AUTOMATICO}>Automático</option>
            {selecionaveis.map((c) => (
              <option key={c.uid} value={c.uid}>
                {c.nome} ({CARGO_LABEL[c.role]})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        &quot;Automático&quot; segue o Mapeamento de Praças (/motor-regras) pela cidade da pasta. Escolher uma praça
        ou um responsável fixa esta tarefa nele, até voltar para &quot;Automático&quot;.
      </p>
      {erro && <p className="mt-1 text-xs text-status-danger">{erro}</p>}
      {alterado && (
        <button
          type="button"
          className="btn-primary mt-3 h-10 px-4 text-xs"
          onClick={salvar}
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar responsável"}
        </button>
      )}
    </Secao>
  );
}

export function NotaConclusaoModal({
  onConfirmar,
  onCancelar,
}: {
  onConfirmar: (nota: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      await onConfirmar(nota);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo="O que foi feito?"
      onClose={onCancelar}
    >
      <textarea
        autoFocus
        rows={4}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Opcional. Ex.: Liguei para o corretor, ele vai enviar o RG até amanhã."
        className="w-full resize-none rounded-md border border-border bg-surface p-3 text-base sm:text-sm text-ink-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-white/15 dark:bg-[#1B1E17] dark:text-white"
      />
      {erro && <p className="mt-2 text-xs text-status-danger">{erro}</p>}
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary h-11 sm:h-10" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="btn-primary h-11 sm:h-10" onClick={confirmar} disabled={enviando}>
          Confirmar Conclusão
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmarExclusaoModal({
  onConfirmar,
  onCancelar,
}: {
  onConfirmar: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setExcluindo(true);
    setErro(null);
    try {
      await onConfirmar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir a tarefa.");
      setExcluindo(false);
    }
  }

  return (
    <Modal titulo="Excluir tarefa?" onClose={onCancelar}>
      <p className="text-sm text-ink-secondary dark:text-white/70">
        A tarefa será apagada definitivamente. Essa ação não pode ser desfeita.
      </p>
      {erro && <p className="mt-3 text-xs text-status-danger">{erro}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary h-11 sm:h-10" onClick={onCancelar} disabled={excluindo}>
          Cancelar
        </button>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center sm:h-10 rounded-md bg-status-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={confirmar}
          disabled={excluindo}
        >
          Excluir
        </button>
      </div>
    </Modal>
  );
}

export function DetalhesTarefaModal({
  tarefa,
  renderDetalheCliente,
  podeReverter,
  onReverter,
  onFechar,
  podeAlterarResponsavel,
  colaboradores,
  pracaOverrides,
  onAlterarResponsavel,
}: {
  tarefa: Tarefa;
  renderDetalheCliente: (cliente: ClienteEnvolvido, fechar: () => void) => ReactNode;
  podeReverter: boolean;
  onReverter: () => Promise<void>;
  onFechar: () => void;
  /** Gerência: mostra a seção "Responsável" (Praça/Cidade + pessoa) logo no topo do modal. */
  podeAlterarResponsavel?: boolean;
  colaboradores?: ColaboradorSelecionavel[];
  pracaOverrides?: PracaOverrides | null;
  onAlterarResponsavel?: (destino: DestinoResponsavelCustomizado | null) => Promise<void>;
}) {
  const [revertendo, setRevertendo] = useState(false);
  const isManual = tarefa.origem === "manual";
  const clientes = tarefa.clientesEnvolvidos ?? [];
  const isGargalo = tarefa.origem === "agregado" && clientes.length > 0;

  // Histórico imutável de tentativas: no gargalo, agrupado por cliente (+ registros do God Mode na tarefa mãe).
  const notasDaTarefa = notasDe(tarefa, !isGargalo);
  const clientesComNotas = clientes.filter((c) => notasDe(c).length > 0);
  const tarefasNotas =
    notasDaTarefa.length === 0 && clientesComNotas.length === 0 ? (
      <p className="text-xs text-ink-muted">Nenhuma nota registrada.</p>
    ) : (
      <div className="space-y-3">
        {clientesComNotas.map((c) => (
          <div key={c.numero}>
            <p className="mb-1 break-words text-xs font-semibold text-ink-primary dark:text-white">
              {c.clienteNome || c.numero}
            </p>
            <HistoricoNotas notas={notasDe(c)} />
          </div>
        ))}
        {notasDaTarefa.length > 0 && <HistoricoNotas notas={notasDaTarefa} />}
      </div>
    );

  async function reverter() {
    setRevertendo(true);
    try {
      await onReverter();
    } finally {
      setRevertendo(false);
    }
  }

  return (
    <Modal titulo="Detalhes da tarefa" onClose={onFechar}>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-ink-primary dark:text-white">
            {isManual
              ? "Solicitação Interna"
              : isGargalo
                ? `${tarefa.tipoPendencia}: ${clientes.length} pastas`
                : tarefa.clienteNome || "Cliente não identificado"}
          </p>
          <p className="text-xs text-ink-muted">
            {isManual
              ? `Enviado por: ${tarefa.criadaPorNome || "—"}`
              : isGargalo
                ? tarefa.descricao
                : tarefa.imobiliaria || "Imobiliária não informada"}
          </p>
        </div>

        {podeAlterarResponsavel && colaboradores && onAlterarResponsavel && (
          <SecaoResponsavel
            tarefa={tarefa}
            colaboradores={colaboradores}
            pracaOverrides={pracaOverrides}
            onAlterar={onAlterarResponsavel}
          />
        )}

        {isManual ? (
          <Secao titulo="Descrição">
            <p className="whitespace-pre-line text-xs leading-relaxed text-ink-secondary dark:text-white/70">
              {tarefa.descricao}
            </p>
          </Secao>
        ) : isGargalo ? (
          <Secao titulo="Clientes envolvidos">
            <ListaClientesEnvolvidos clientes={clientes} podeMarcar={false} renderDetalhe={renderDetalheCliente} />
          </Secao>
        ) : (
          <>
            <Secao titulo="Trajeto da pasta">
              <TrajetoPasta dados={tarefa} />
            </Secao>

            <Secao titulo="Observação original">
              {tarefa.observacaoOriginal ? (
                <ObservacaoChecklist texto={tarefa.observacaoOriginal} />
              ) : (
                <p className="text-xs text-ink-muted">Sem observação.</p>
              )}
            </Secao>
          </>
        )}

        <Secao titulo="O que foi feito">
          {tarefasNotas}
          {tarefa.resolvidoEm && (
            <p className="mt-1 text-[11px] text-ink-muted">Concluída em {formatDateTimeBR(tarefa.resolvidoEm)}</p>
          )}
        </Secao>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {podeReverter && (
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center sm:h-10 gap-1.5 rounded-md border border-status-danger/40 bg-status-danger/10 px-4 text-sm font-semibold text-status-danger transition-colors hover:bg-status-danger/15 disabled:opacity-50"
            onClick={reverter}
            disabled={revertendo}
          >
            <Undo2 size={16} />
            Reverter / Tarefa Incompleta
          </button>
        )}
        <button type="button" className="btn-secondary h-11 sm:h-10" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{titulo}</p>
      {children}
    </div>
  );
}
