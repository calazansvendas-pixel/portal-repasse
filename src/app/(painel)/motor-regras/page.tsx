"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeConfigurarRegrasAuditoria } from "@/lib/auth/roles";
import { useRegrasAuditoria } from "@/lib/hooks/useRegrasAuditoria";
import {
  alternarRegraAtiva,
  atualizarRegraAuditoria,
  criarRegraAuditoria,
  excluirRegraAuditoria,
} from "@/lib/services/regrasAuditoriaService";
import { Topbar } from "@/components/layout/Topbar";
import { FormularioRegra } from "@/components/regras/FormularioRegra";
import {
  CARGO_DESTINO_LABEL,
  CATEGORIA_GATILHO_LABEL,
  type NovaRegraAuditoria,
  type RegraAuditoria,
} from "@/lib/types/regrasAuditoria";
import { cn } from "@/lib/utils/cn";

export default function MotorDeRegrasPage() {
  const { profile, firebaseUser } = useAuth();
  const podeVer = !!profile && podeConfigurarRegrasAuditoria(profile.role);
  const { regras, loading, erro } = useRegrasAuditoria(podeVer);
  const [modalAberto, setModalAberto] = useState(false);
  // null com o modal aberto = criando uma regra nova; preenchido = editando esta regra.
  const [regraEditando, setRegraEditando] = useState<RegraAuditoria | null>(null);
  // Rascunho pré-preenchido para duplicação: regraEditando fica null (é sempre um INSERT), só o
  // formulário nasce com os campos da regra de origem.
  const [rascunhoDuplicando, setRascunhoDuplicando] = useState<NovaRegraAuditoria | null>(null);

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Motor de Regras" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  function abrirCriacao() {
    setRegraEditando(null);
    setRascunhoDuplicando(null);
    setModalAberto(true);
  }

  function abrirEdicao(regra: RegraAuditoria) {
    setRegraEditando(regra);
    setRascunhoDuplicando(null);
    setModalAberto(true);
  }

  function duplicarRegra(regra: RegraAuditoria) {
    // regraEditando fica null de propósito: salvarRegra() trata isto como criação (insert), não
    // update — mesmo com todos os campos vindos da regra original.
    setRegraEditando(null);
    setRascunhoDuplicando({
      nomeRegra: `${regra.nomeRegra} (Cópia)`,
      cargoDestino: regra.cargoDestino,
      categoriaGatilho: regra.categoriaGatilho,
      parametros: { ...regra.parametros },
      textoTarefa: regra.textoTarefa,
      exigeAcaoHumana: regra.exigeAcaoHumana,
      ativo: regra.ativo,
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setRegraEditando(null);
    setRascunhoDuplicando(null);
  }

  async function salvarRegra(dados: NovaRegraAuditoria) {
    if (regraEditando) {
      await atualizarRegraAuditoria(regraEditando.id, dados);
    } else {
      if (!firebaseUser) return;
      await criarRegraAuditoria(dados, firebaseUser.uid);
    }
    fecharModal();
  }

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir a regra "${nome}"? Essa ação não pode ser desfeita.`)) return;
    await excluirRegraAuditoria(id);
  }

  const regrasOrdenadas = [...regras].sort(compararRegras);
  const ativas = regrasOrdenadas.filter((r) => r.ativo);
  const inativas = regrasOrdenadas.filter((r) => !r.ativo);

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Motor de Regras" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-secondary dark:text-white/60">
          Matriz de Responsabilidades: configure aqui os gatilhos que geram tarefas automaticamente, sem precisar de
          um desenvolvedor. As importações já aplicam estas regras às pastas.
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={abrirCriacao}>
          <Plus size={16} />
          Criar Nova Regra
        </button>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{erro}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted">Carregando regras…</p>
      ) : regras.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-ink-muted">
          Nenhuma regra cadastrada ainda. Clique em &quot;Criar Nova Regra&quot; para começar.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <SecaoRegras
            titulo={`Ativas (${ativas.length})`}
            regras={ativas}
            onAlternar={alternarRegraAtiva}
            onEditar={abrirEdicao}
            onDuplicar={duplicarRegra}
            onExcluir={excluir}
          />
          {inativas.length > 0 && (
            <SecaoRegras
              titulo={`Inativas (${inativas.length})`}
              regras={inativas}
              onAlternar={alternarRegraAtiva}
              onEditar={abrirEdicao}
              onDuplicar={duplicarRegra}
              onExcluir={excluir}
            />
          )}
        </div>
      )}

      {modalAberto && (
        <FormularioRegra
          regraExistente={regraEditando}
          rascunhoInicial={rascunhoDuplicando}
          onSalvar={salvarRegra}
          onCancelar={fecharModal}
        />
      )}
    </div>
  );
}

function SecaoRegras({
  titulo,
  regras,
  onAlternar,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  titulo: string;
  regras: RegraAuditoria[];
  onAlternar: (id: string, ativo: boolean) => Promise<void>;
  onEditar: (regra: RegraAuditoria) => void;
  onDuplicar: (regra: RegraAuditoria) => void;
  onExcluir: (id: string, nome: string) => Promise<void>;
}) {
  if (regras.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{titulo}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {regras.map((r) => (
          <CardRegra
            key={r.id}
            regra={r}
            onAlternar={onAlternar}
            onEditar={onEditar}
            onDuplicar={onDuplicar}
            onExcluir={onExcluir}
          />
        ))}
      </div>
    </section>
  );
}

function CardRegra({
  regra,
  onAlternar,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  regra: RegraAuditoria;
  onAlternar: (id: string, ativo: boolean) => Promise<void>;
  onEditar: (regra: RegraAuditoria) => void;
  onDuplicar: (regra: RegraAuditoria) => void;
  onExcluir: (id: string, nome: string) => Promise<void>;
}) {
  return (
    <div className={cn("surface-card flex flex-col gap-3 p-4", !regra.ativo && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary dark:text-white">{regra.nomeRegra}</p>
          <p className="text-xs text-ink-muted">{CATEGORIA_GATILHO_LABEL[regra.categoriaGatilho]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {regra.exigeAcaoHumana && (
            <span
              title="Exige ação humana: a importação nunca fecha esta tarefa sozinha"
              className="rounded-full bg-status-warning/10 p-1.5 text-status-warning"
            >
              <ShieldCheck size={14} />
            </span>
          )}
          <button
            type="button"
            onClick={() => onDuplicar(regra)}
            title="Duplicar regra"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-primary dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={() => onEditar(regra)}
            title="Editar regra"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-primary dark:hover:bg-white/10 dark:hover:text-white"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>

      <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink-secondary dark:text-white/70">
        {regra.textoTarefa}
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span>
          Destino: <span className="font-medium text-ink-secondary dark:text-white/70">{CARGO_DESTINO_LABEL[regra.cargoDestino]}</span>
        </span>
        {regra.parametros.dias !== undefined && <span>Dias: {regra.parametros.dias}</span>}
        {regra.parametros.quantidade !== undefined && <span>Quantidade: {regra.parametros.quantidade}</span>}
        {regra.parametros.etapa && <span>Etapa: {regra.parametros.etapa}</span>}
        {regra.parametros.palavraChave && <span>Palavra-chave: &quot;{regra.parametros.palavraChave}&quot;</span>}
        {regra.parametros.dimensao && <span>Agrupado por: {regra.parametros.dimensao}</span>}
        {regra.parametros.subtipoConformidade && <span>Verificação: {regra.parametros.subtipoConformidade}</span>}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-3 dark:border-white/10">
        <label className="flex items-center gap-2 text-xs text-ink-secondary dark:text-white/70">
          <input
            type="checkbox"
            checked={regra.ativo}
            onChange={(e) => onAlternar(regra.id, e.target.checked)}
            className="h-4 w-4 accent-brand-primary"
          />
          Ativa
        </label>
        <button
          type="button"
          onClick={() => onExcluir(regra.id, regra.nomeRegra)}
          title="Excluir regra"
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-status-danger/10 hover:text-status-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

const PREFIXO_NUMERICO_NOME = /^(\d+\.\d+)/;

/** `parametros.etapa` como número (ex.: "0.80" -> 0.8); null quando a regra não tem etapa. */
function valorEtapa(etapa: string | undefined): number | null {
  const bruto = etapa?.trim();
  if (!bruto) return null;
  const n = Number.parseFloat(bruto);
  return Number.isNaN(n) ? null : n;
}

/**
 * Valor numérico de ordenação de uma regra: prioriza o prefixo do NOME (ex.: "0.99 - Gargalo..."
 * -> 0.99), porque é o que a Gerência realmente usa como convenção — inclusive em categorias
 * agregadas (Volume/Gargalos) que não preenchem `parametros.etapa` da mesma forma que SLA. Só cai
 * para `parametros.etapa` quando o nome não tem esse prefixo. null = sem número em lugar nenhum
 * (ex.: "Duplicidade de pasta"), vai para o final.
 */
function valorOrdenacao(regra: RegraAuditoria): number | null {
  const doNome = regra.nomeRegra.trim().match(PREFIXO_NUMERICO_NOME)?.[1];
  if (doNome !== undefined) {
    const n = Number.parseFloat(doNome);
    if (!Number.isNaN(n)) return n;
  }
  return valorEtapa(regra.parametros.etapa);
}

/** Número consolidado crescente primeiro (sem número nenhum vai para o fim); nome alfabético como desempate. */
function compararRegras(a: RegraAuditoria, b: RegraAuditoria): number {
  const valorA = valorOrdenacao(a);
  const valorB = valorOrdenacao(b);
  if (valorA !== null && valorB !== null && valorA !== valorB) return valorA - valorB;
  if (valorA === null && valorB !== null) return 1;
  if (valorA !== null && valorB === null) return -1;
  return a.nomeRegra.localeCompare(b.nomeRegra, "pt-BR");
}
