"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Pencil, Trash2, UserCog, Undo2 } from "lucide-react";
import type { ClienteEnvolvido, EtapaHistorico, Tarefa } from "@/lib/types";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import {
  alternarClienteEnvolvido,
  definirResponsavelCustomizado,
  excluirTarefa,
  marcarFeitaPelaGerencia,
  marcarTarefaResolvida,
  reverterTarefa,
  type DestinoResponsavelCustomizado,
} from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { meuQuadroInterativo, resolvePracaPorCidade, type PracaOverrides } from "@/lib/auth/roles";
import { useMapeamentoPracas } from "@/lib/hooks/useMapeamentoPracas";
import { useColaboradores } from "@/lib/hooks/useColaboradores";
import { formatDateBR } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { ConfirmarExclusaoModal, DetalhesTarefaModal, NotaConclusaoModal } from "./ModaisTarefa";
import { MenuTarefa, type ItemMenu } from "./MenuTarefa";
import { NovaTarefaModal } from "./NovaTarefaModal";
import { ListaClientesEnvolvidos } from "./ClientesEnvolvidos";
import { HistoricoNotas, ObservacaoChecklist, TrajetoPasta, dataUltimaPlanilha, notasDe } from "./partesCard";

const PRACAS_ASSISTENTES: Tarefa["praca"][] = ["layza", "eliane", "catharina"];

/** Primeiro nome a partir de um rótulo como "Andressa (Analista)" ou "Layza (Serra)". */
function primeiroNome(rotulo: string): string {
  return rotulo.split(" (")[0]?.trim() || rotulo;
}

/**
 * Segunda passada de substituição de variáveis no texto da tarefa. `{analista}` e `{assistente}`
 * o Motor de Regras não resolve sozinho no servidor (dependem de quem ocupa o cargo hoje, não da
 * planilha); aqui viram o nome real via os rótulos já existentes no app. `{assistente}` é
 * resolvido pela CIDADE da pasta (`resolvePracaPorCidade`), não pelo `praca` da própria tarefa —
 * um card que vive no quadro da Analista/Coordenador (ex.: "Entender com a {assistente}...") ainda
 * precisa apontar o nome de quem realmente cuida daquela praça, não um texto genérico.
 * `{cliente}`/`{imobiliaria}` já chegam substituídos pelo motor em tarefas de linha — a troca aqui
 * é só uma rede de segurança (normalmente um no-op). Em tarefas agregadas (Volume/Gargalos) não há
 * um cliente/imobiliária único, então essas duas ficam de fora: o texto permanece coeso e o
 * detalhamento mora na lista de pastas relacionadas.
 */
function formatarDescricao(tarefa: Tarefa, overrides?: PracaOverrides | null): string {
  const pracaDaPasta = resolvePracaPorCidade(tarefa.cidade, overrides);
  let texto = tarefa.descricao
    .replaceAll("{analista}", primeiroNome(QUADRO_LABEL.analista))
    .replaceAll("{assistente}", pracaDaPasta ? primeiroNome(ASSISTENTE_LABEL[pracaDaPasta]) : "a assistente responsável");

  if (tarefa.origem !== "agregado") {
    texto = texto
      .replaceAll("{cliente}", tarefa.clienteNome || "cliente não identificado")
      .replaceAll("{imobiliaria}", tarefa.imobiliaria || "imobiliária não informada");
  }

  return texto;
}

/**
 * Dias consecutivos que a pasta aparece na etapa atual, contando as entradas mais recentes do
 * trajeto (`historicoEtapas`) — um item por Daily Delta importado, o mesmo critério que o Motor de
 * Regras usa para SLA/Estagnação. Só existe para tarefas de linha (origem "linha"); agregadas e
 * avulsas não têm um trajeto de pasta único para contar.
 */
function diasNaEtapaAtual(tarefa: Tarefa): number | null {
  if (tarefa.origem !== "linha" || !tarefa.historicoEtapas?.length) return null;
  const etapaAtual = tarefa.etapa.trim();
  let dias = 0;
  for (let i = tarefa.historicoEtapas.length - 1; i >= 0; i--) {
    if (tarefa.historicoEtapas[i].etapa.trim() !== etapaAtual) break;
    dias++;
  }
  return dias || null;
}

/**
 * `gargalo` = este card representa UM cliente dentro de uma tarefa agregada (aberto a partir da lista
 * da sanfona): é o mesmo card individual, mas as ações valem para o check daquele cliente e a tarefa
 * mãe (`pai`) só muda de estado quando todos os clientes estão marcados.
 */
export function TaskCard({
  tarefa,
  somenteLeitura = false,
  gargalo,
  className,
}: {
  tarefa: Tarefa;
  somenteLeitura?: boolean;
  gargalo?: { pai: Tarefa; numero: string };
  /** Ex.: "h-full" quando o card vive numa grelha e precisa acompanhar a altura da linha. */
  className?: string;
}) {
  const { firebaseUser, profile } = useAuth();
  const { overrides: pracaOverrides } = useMapeamentoPracas();
  const { colaboradores } = useColaboradores(profile?.role === "gerencia");
  const [modal, setModal] = useState<"nota" | "detalhes" | "editar" | "excluir" | null>(null);
  // Número do cliente cujo check completa a tarefa agregada (pede a nota opcional antes de gravar).
  const [clientePendente, setClientePendente] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  // "Feitas"/"Realizadas": tanto a tarefa aguardando confirmação da próxima planilha
  // (pending_validation) quanto a já confirmada e arquivada (validated_done) viram o mesmo
  // card-pílula, só de leitura — com autor, data e notas de resolução sempre visíveis.
  const concluida = tarefa.status === "pending_validation" || tarefa.status === "validated_done";
  const falhaAuditoria = tarefa.status === "audit_failed";
  const diasEtapa = diasNaEtapaAtual(tarefa);
  const isAgregado = tarefa.origem === "agregado";
  const isManual = tarefa.origem === "manual";
  const clientes = (gargalo ? gargalo.pai : tarefa).clientesEnvolvidos ?? [];
  const clienteDoGargalo = gargalo ? clientes.find((c) => c.numero === gargalo.numero) : undefined;
  const temSubtarefas = isAgregado && !gargalo && clientes.length > 0;
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
  // Tarefa agregada: as notas ficam em cada cliente (só entradas do God Mode moram na tarefa mãe).
  const notasCard = notasDe(tarefa, !isAgregado);

  const itensMenu: ItemMenu[] = [];
  if (podeEditarExcluir) itensMenu.push({ rotulo: "Editar", icone: Pencil, onClick: () => setModal("editar") });
  // Reassociar o cartão a outro responsável (ou devolver ao "Automático") — não se aplica a um
  // cliente individual dentro de um gargalo: a praça é da tarefa agregada inteira, não do cliente.
  if (ehGerencia && !gargalo) {
    itensMenu.push({ rotulo: "Ver detalhes / Responsável", icone: UserCog, onClick: () => setModal("detalhes") });
  }
  if (gargalo) {
    // God Mode no cliente do gargalo: marca/desmarca só o check dele. Excluir fica de fora — um cliente
    // só sai do gargalo pelo check; excluir o gargalo inteiro é no menu do card do gargalo.
    if (ehGerencia && clienteDoGargalo) {
      itensMenu.push({
        rotulo: clienteDoGargalo.concluido ? "Voltar para ativa" : "Marcar como feita",
        icone: clienteDoGargalo.concluido ? Undo2 : CheckCircle2,
        onClick: () => (clienteDoGargalo.concluido ? desmarcarClienteDoGargalo() : setModal("nota")),
      });
    }
  } else if (ehGerencia && !concluida) {
    itensMenu.push({
      rotulo: "Marcar como feita",
      icone: CheckCircle2,
      onClick: () => firebaseUser && marcarFeitaPelaGerencia(tarefa, firebaseUser.uid, profile?.nome),
    });
  } else if (ehGerencia && concluida) {
    itensMenu.push({ rotulo: "Voltar para ativa", icone: Undo2, onClick: () => reverterTarefa(tarefa) });
  }
  if (podeEditarExcluir && !gargalo) itensMenu.push({ rotulo: "Excluir", icone: Trash2, onClick: () => setModal("excluir"), perigo: true });

  async function confirmarConclusao(nota: string) {
    if (!firebaseUser) return;
    await marcarTarefaResolvida(tarefa, firebaseUser.uid, nota, profile?.nome, profile?.role);
    setModal(null);
  }

  // Cliente dentro do gargalo (modal do cliente): concluir pede a nota, como num card individual;
  // desmarcar só volta o check — a nota gravada fica.
  async function marcarClienteDoGargalo(nota: string) {
    if (!firebaseUser || !gargalo) return;
    await alternarClienteEnvolvido(gargalo.pai.id, gargalo.numero, firebaseUser.uid, nota, profile?.nome, profile?.role);
    setModal(null);
  }

  async function desmarcarClienteDoGargalo() {
    if (!firebaseUser || !gargalo) return;
    await alternarClienteEnvolvido(gargalo.pai.id, gargalo.numero, firebaseUser.uid);
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
    await alternarClienteEnvolvido(tarefa.id, clientePendente, firebaseUser.uid, nota, profile?.nome, profile?.role);
    setClientePendente(null);
  }

  async function reverter() {
    await reverterTarefa(tarefa);
    setModal(null);
  }

  async function alterarResponsavel(destino: DestinoResponsavelCustomizado | null) {
    await definirResponsavelCustomizado(tarefa, destino, profile?.nome ?? null);
    setModal(null);
  }

  async function excluir() {
    if (!firebaseUser) return;
    await excluirTarefa(tarefa.id, await firebaseUser.getIdToken());
    setModal(null);
  }

  if (concluida) {
    const nome = isManual
      ? formatarDescricao(tarefa, pracaOverrides)
      : isAgregado
        ? tituloAgregado
        : tarefa.clienteNome || tarefa.imobiliaria || tarefa.tipoPendencia;
    return (
      <>
        <div className={cn("surface-card flex h-full flex-col gap-3 break-words p-4", className)}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setModal("detalhes")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setModal("detalhes")}
            className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 transition-opacity hover:opacity-80"
          >
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary dark:text-white">{nome}</p>
            <div className="flex shrink-0 items-center gap-2">
              {itensMenu.length > 0 && <MenuTarefa itens={itensMenu} />}
              <span className="rounded-full bg-status-success/15 p-1.5 text-status-success">
                <Check size={20} strokeWidth={3} />
              </span>
            </div>
          </div>

          {/* Capa do gargalo concluído: nomes dos clientes com o check individual (detalhes: clique no card) */}
          {temSubtarefas && (
            <ul className="space-y-0.5">
              {clientes.map((c) => (
                <li key={c.numero} className="flex items-center gap-1.5 text-sm text-ink-secondary dark:text-white/70">
                  <Check
                    size={14}
                    strokeWidth={3}
                    className={c.concluido ? "shrink-0 text-status-success" : "shrink-0 text-transparent"}
                    aria-label={c.concluido ? "Concluído" : undefined}
                  />
                  <span className="min-w-0 break-words">{c.clienteNome || `Pasta ${c.numero}`}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Histórico imutável mesmo quando concluído */}
          {notasCard.length > 0 && (
            <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                O que foi feito
              </p>
              <HistoricoNotas notas={notasCard} />
            </div>
          )}
        </div>
        {modal === "detalhes" && (
          <DetalhesTarefaModal
            tarefa={tarefa}
            renderDetalheCliente={(c, fechar) => (
              <CardClienteGargalo pai={tarefa} cliente={c} somenteLeitura onFechar={fechar} />
            )}
            podeReverter={podeReverter}
            onReverter={reverter}
            onFechar={() => setModal(null)}
            podeAlterarResponsavel={ehGerencia}
            colaboradores={colaboradores}
            pracaOverrides={pracaOverrides}
            onAlterarResponsavel={alterarResponsavel}
          />
        )}
        {modal === "editar" && <NovaTarefaModal tarefa={gargalo?.pai ?? tarefa} onFechar={() => setModal(null)} />}
        {modal === "excluir" && <ConfirmarExclusaoModal onConfirmar={excluir} onCancelar={() => setModal(null)} />}
      </>
    );
  }

  return (
    <div
      className={cn(
        "surface-card flex h-full min-w-0 flex-col gap-3 break-words p-4",
        falhaAuditoria && "border-status-danger/50 bg-status-danger/5",
        className
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

      {/* Cabeçalho empilhado: 1) dias na etapa + menu · 2/3) identidade do card (cliente + imobiliária
          | solicitação interna | gargalo/sanfona) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          {diasEtapa !== null ? (
            <span className="whitespace-nowrap text-[11px] text-gray-400 dark:text-white/30">
              Há {diasEtapa} {diasEtapa === 1 ? "dia" : "dias"} na etapa
            </span>
          ) : (
            <span />
          )}
          {itensMenu.length > 0 && <MenuTarefa itens={itensMenu} />}
        </div>

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
              className="-mx-1.5 -my-1.5 flex min-h-[44px] w-[calc(100%+0.75rem)] items-start gap-2 px-1.5 py-1.5 text-left"
            >
              <span className="mt-0 shrink-0">{expandido ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</span>
              <span>
                <span className="block break-words text-sm font-semibold leading-snug text-ink-primary dark:text-white">
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => setModal("detalhes")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setModal("detalhes")}
            className="-mx-1.5 -my-1.5 min-w-0 cursor-pointer rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-soft dark:hover:bg-white/5"
          >
            <p className="break-words text-sm font-semibold leading-snug text-ink-primary dark:text-white">
              {tarefa.clienteNome || "Cliente não identificado"}
            </p>
            <p className="break-words text-xs text-ink-muted">{tarefa.imobiliaria || "Imobiliária não informada"}</p>
          </div>
        )}
      </div>

      {/* Corpo 1: ação de consultoria/ajuda */}
      <p className="whitespace-pre-line break-words text-sm font-medium leading-snug text-ink-primary dark:text-white">
        {formatarDescricao(tarefa, pracaOverrides)}
      </p>

      {/* Lista direta dos clientes envolvidos (agregados do Motor de Regras) — sem precisar abrir
          modal ou sanfona para ver quem está no gargalo. */}
      {isAgregado && !!tarefa.nomesRelacionados?.length && (
        <ul className="space-y-0.5 text-sm text-gray-600 dark:text-white/60">
          {tarefa.nomesRelacionados.map((nome, i) => (
            <li key={i} className="truncate">
              {nome}
            </li>
          ))}
        </ul>
      )}

      {/* Sub-tarefas do gargalo: um check por cliente */}
      {temSubtarefas && expandido && (
        <ListaClientesEnvolvidos
          clientes={clientes}
          podeMarcar={!somenteLeitura}
          onAlternar={alternarCliente}
          renderDetalhe={(c, fechar) => (
            <CardClienteGargalo pai={tarefa} cliente={c} somenteLeitura={somenteLeitura} onFechar={fechar} />
          )}
        />
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

      {/* Histórico imutável de tentativas: continua visível depois de reverter ou de falha de auditoria */}
      {notasCard.length > 0 && (
        <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            O que foi feito
          </p>
          <HistoricoNotas notas={notasCard} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary dark:border-white/15 dark:text-white/60">
          {tarefa.tipoPendencia.replace(/\(Cópia\)/g, "").trim()}
        </span>
        {tarefa.cicloFollowUp && (
          <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary dark:bg-white/10 dark:text-white/80">
            Ciclo {tarefa.cicloFollowUp} de 4
          </span>
        )}
      </div>

      {/* Rodapé: trajeto da pasta (stepper vertical) ou última planilha em agregados. mt-auto
          crava o rodapé (e o botão de ação, logo abaixo) na base do card quando a grelha estica
          esta linha para acompanhar o card mais alto. */}
      <div className="mt-auto border-t border-border pt-3 dark:border-white/10">
        {isAgregado ? (
          ultimaPlanilhaAgregado && (
            <span className="text-xs text-ink-muted">
              Última planilha importada: {formatDateBR(ultimaPlanilhaAgregado)}
            </span>
          )
        ) : isManual ? (
          <span className="text-xs text-ink-muted">Criada em {formatDateBR(tarefa.criadoEm)}</span>
        ) : (
          <TrajetoPasta dados={tarefa} />
        )}

        {gargalo && clienteDoGargalo?.concluido && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-status-success">
            <Check size={14} strokeWidth={3} />
            Concluído neste gargalo
          </p>
        )}
        {!somenteLeitura && gargalo && clienteDoGargalo && (
          <button
            type="button"
            onClick={() => (clienteDoGargalo.concluido ? desmarcarClienteDoGargalo() : setModal("nota"))}
            className={cn(
              "mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors sm:text-xs",
              clienteDoGargalo.concluido
                ? "border-border text-ink-secondary hover:bg-surface-soft dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                : "border-status-success/40 bg-status-success/10 text-status-success hover:bg-status-success/15"
            )}
          >
            {clienteDoGargalo.concluido ? <Undo2 size={14} /> : <Check size={14} />}
            {clienteDoGargalo.concluido ? "Desmarcar" : "Marcar como resolvida"}
          </button>
        )}
        {!somenteLeitura && !gargalo && !temSubtarefas && (
          <button
            type="button"
            onClick={() => setModal("nota")}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/10 px-3 py-2.5 min-h-[44px] text-sm font-semibold sm:text-xs text-status-success transition-colors hover:bg-status-success/15"
          >
            <Check size={14} />
            Marcar como resolvida
          </button>
        )}
      </div>

      {modal === "detalhes" && (
        <DetalhesTarefaModal
          tarefa={tarefa}
          renderDetalheCliente={(c, fechar) => (
            <CardClienteGargalo pai={tarefa} cliente={c} somenteLeitura onFechar={fechar} />
          )}
          podeReverter={podeReverter}
          onReverter={reverter}
          onFechar={() => setModal(null)}
          podeAlterarResponsavel={ehGerencia}
          colaboradores={colaboradores}
          pracaOverrides={pracaOverrides}
          onAlterarResponsavel={alterarResponsavel}
        />
      )}
      {modal === "editar" && <NovaTarefaModal tarefa={gargalo?.pai ?? tarefa} onFechar={() => setModal(null)} />}
      {modal === "excluir" && <ConfirmarExclusaoModal onConfirmar={excluir} onCancelar={() => setModal(null)} />}
      {modal === "nota" && <NotaConclusaoModal onConfirmar={gargalo ? marcarClienteDoGargalo : confirmarConclusao} onCancelar={() => setModal(null)} />}
      {clientePendente && (
        <NotaConclusaoModal onConfirmar={confirmarClientePendente} onCancelar={() => setClientePendente(null)} />
      )}
    </div>
  );
}

/**
 * Detalhe de UM cliente do gargalo: o mesmo TaskCard de uma tarefa individual, montado com os dados da
 * pasta (cabeçalho, "O que foi relatado", etiquetas, data limite, linha do tempo diária e menu).
 */
function CardClienteGargalo({
  pai,
  cliente,
  somenteLeitura,
  onFechar,
}: {
  pai: Tarefa;
  cliente: ClienteEnvolvido;
  somenteLeitura: boolean;
  onFechar: () => void;
}) {
  // A tarefa guarda só as últimas entradas de cada cliente (limite de tamanho do documento);
  // o trajeto integral está no registro da pasta.
  const [historicoCompleto, setHistoricoCompleto] = useState<EtapaHistorico[] | null>(null);

  useEffect(() => {
    let ativo = true;
    getDoc(doc(db, "registros", cliente.numero))
      .then((snap) => {
        const completo = snap.data()?.historicoEtapas as EtapaHistorico[] | undefined;
        if (ativo && completo) setHistoricoCompleto(completo);
      })
      .catch(() => {
        // sem permissão/rede: segue com as entradas embutidas na tarefa
      });
    return () => {
      ativo = false;
    };
  }, [cliente.numero]);

  const embutido = cliente.historicoEtapas ?? [];
  const historico = historicoCompleto && historicoCompleto.length >= embutido.length ? historicoCompleto : embutido;

  const comoTarefaIndividual: Tarefa = {
    ...pai,
    origem: "linha",
    numero: cliente.numero,
    numerosRelacionados: null,
    clienteNome: cliente.clienteNome,
    imobiliaria: cliente.imobiliaria,
    dataEntrada: cliente.dataEntrada,
    etapa: cliente.etapa,
    observacaoOriginal: cliente.observacao,
    historicoEtapas: historico,
    slaStatus: historico[historico.length - 1]?.status ?? pai.slaStatus,
    clientesEnvolvidos: undefined,
    // as notas são do cliente, não as da tarefa mãe
    notaResolucao: cliente.notaResolucao ?? null,
    historicoNotas: cliente.historicoNotas ?? [],
    resolvidoEm: null,
    cicloFollowUp: null,
    // O cartão do cliente fica sempre "aberto"; o estado dele aparece no rodapé (check do cliente).
    status: pai.status === "audit_failed" ? "audit_failed" : "pendente",
  };

  return (
    <Modal
      titulo={cliente.clienteNome || `Pasta ${cliente.numero}`}
      onClose={onFechar}
      semMoldura
      rodape={
        <button type="button" className="btn-secondary h-11 w-full bg-surface dark:bg-[#1B1E17]" onClick={onFechar}>
          Fechar
        </button>
      }
    >
      <TaskCard tarefa={comoTarefaIndividual} somenteLeitura={somenteLeitura} gargalo={{ pai, numero: cliente.numero }} />
    </Modal>
  );
}
