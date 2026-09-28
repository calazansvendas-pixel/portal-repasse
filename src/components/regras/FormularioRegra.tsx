"use client";

import { useState } from "react";
import type { Role } from "@/lib/types";
import {
  CARGO_DESTINO_LABEL,
  CATEGORIA_GATILHO_DESCRICAO,
  CATEGORIA_GATILHO_LABEL,
  type CategoriaGatilho,
  type NovaRegraAuditoria,
  type ParametrosRegra,
} from "@/lib/types/regrasAuditoria";
import { Modal } from "@/components/ui/Modal";

const CARGOS: Role[] = ["assistente", "analista", "coordenador", "gerencia"];
const CATEGORIAS = Object.keys(CATEGORIA_GATILHO_LABEL) as CategoriaGatilho[];

/** Quais campos genéricos de parâmetro cada categoria pede na tela (cascata). */
const CAMPOS_POR_CATEGORIA: Record<CategoriaGatilho, ("dias" | "quantidade" | "etapa" | "palavraChave" | "dimensao" | "subtipoConformidade")[]> = {
  sla_estagnacao: ["etapa", "dias"],
  volume_gargalo: ["dimensao", "quantidade"],
  analise_textual: ["palavraChave"],
  regressao: ["etapa"],
  ociosidade_imobiliaria: ["dias"],
  qualidade_reprovacao: ["quantidade"],
  conformidade: ["subtipoConformidade", "dias"],
  acoes_positivas: ["quantidade", "dias"],
  sla_interno: ["dias"],
};

const RASCUNHO_INICIAL: NovaRegraAuditoria = {
  nomeRegra: "",
  cargoDestino: "assistente",
  categoriaGatilho: "sla_estagnacao",
  parametros: {},
  textoTarefa: "",
  exigeAcaoHumana: false,
  ativo: true,
};

export function FormularioRegra({
  onSalvar,
  onCancelar,
}: {
  onSalvar: (regra: NovaRegraAuditoria) => Promise<void>;
  onCancelar: () => void;
}) {
  const [regra, setRegra] = useState<NovaRegraAuditoria>(RASCUNHO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const camposParametro = CAMPOS_POR_CATEGORIA[regra.categoriaGatilho];
  const podeSalvar = regra.nomeRegra.trim().length > 0 && regra.textoTarefa.trim().length > 0 && !enviando;

  function setParametro<K extends keyof ParametrosRegra>(chave: K, valor: ParametrosRegra[K]) {
    setRegra((r) => ({ ...r, parametros: { ...r.parametros, [chave]: valor } }));
  }

  function trocarCategoria(categoria: CategoriaGatilho) {
    // Troca de categoria começa os parâmetros do zero — os campos exibidos mudam por completo.
    setRegra((r) => ({ ...r, categoriaGatilho: categoria, parametros: {} }));
  }

  async function salvar() {
    if (!podeSalvar) return;
    setEnviando(true);
    setErro(null);
    try {
      await onSalvar(regra);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a regra.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Criar Nova Regra" onClose={onCancelar}>
      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Nome da regra</span>
          <input
            className="input-field"
            value={regra.nomeRegra}
            onChange={(e) => setRegra((r) => ({ ...r, nomeRegra: e.target.value }))}
            placeholder="Ex.: Pasta parada há mais de 5 dias na 0.80"
            maxLength={120}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Categoria do gatilho</span>
            <select
              className="input-field"
              value={regra.categoriaGatilho}
              onChange={(e) => trocarCategoria(e.target.value as CategoriaGatilho)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_GATILHO_LABEL[c]}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-muted">{CATEGORIA_GATILHO_DESCRICAO[regra.categoriaGatilho]}</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cargo de destino</span>
            <select
              className="input-field"
              value={regra.cargoDestino}
              onChange={(e) => setRegra((r) => ({ ...r, cargoDestino: e.target.value as Role }))}
            >
              {CARGOS.map((c) => (
                <option key={c} value={c}>
                  {CARGO_DESTINO_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Parâmetros: cascata que muda de cara conforme a categoria escolhida acima. */}
        <div className="rounded-md border border-border bg-surface-secondary/60 p-3 dark:border-white/10 dark:bg-white/5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Parâmetros</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {camposParametro.includes("dias") && (
              <CampoNumero
                label="Dias"
                valor={regra.parametros.dias}
                onChange={(v) => setParametro("dias", v)}
              />
            )}
            {camposParametro.includes("quantidade") && (
              <CampoNumero
                label="Quantidade"
                valor={regra.parametros.quantidade}
                onChange={(v) => setParametro("quantidade", v)}
              />
            )}
            {camposParametro.includes("etapa") && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-ink-secondary dark:text-white/70">Etapa</span>
                <input
                  className="input-field"
                  value={regra.parametros.etapa ?? ""}
                  onChange={(e) => setParametro("etapa", e.target.value)}
                  placeholder="Ex.: 0.80"
                />
              </label>
            )}
            {camposParametro.includes("palavraChave") && (
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-xs text-ink-secondary dark:text-white/70">Palavra-chave</span>
                <input
                  className="input-field"
                  value={regra.parametros.palavraChave ?? ""}
                  onChange={(e) => setParametro("palavraChave", e.target.value)}
                  placeholder="Ex.: restrição"
                />
              </label>
            )}
            {camposParametro.includes("dimensao") && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-ink-secondary dark:text-white/70">Agrupar gargalo por</span>
                <select
                  className="input-field"
                  value={regra.parametros.dimensao ?? "etapa"}
                  onChange={(e) => setParametro("dimensao", e.target.value as ParametrosRegra["dimensao"])}
                >
                  <option value="etapa">Etapa</option>
                  <option value="imobiliaria">Imobiliária</option>
                  <option value="produto">Produto</option>
                </select>
              </label>
            )}
            {camposParametro.includes("subtipoConformidade") && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-ink-secondary dark:text-white/70">Verificação</span>
                <select
                  className="input-field"
                  value={regra.parametros.subtipoConformidade ?? "duplicidade"}
                  onChange={(e) =>
                    setParametro("subtipoConformidade", e.target.value as ParametrosRegra["subtipoConformidade"])
                  }
                >
                  <option value="duplicidade">Duplicidade de pasta</option>
                  <option value="vencimento_longo">Vencimento muito longo</option>
                </select>
              </label>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Texto da tarefa</span>
          <textarea
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-surface p-3 text-base sm:text-sm text-ink-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-white/15 dark:bg-[#1B1E17] dark:text-white"
            value={regra.textoTarefa}
            onChange={(e) => setRegra((r) => ({ ...r, textoTarefa: e.target.value }))}
            placeholder="Ex.: Ligar para {imobiliaria} sobre a pasta de {cliente}, parada há {dias} dias."
            maxLength={500}
          />
          <span className="text-[11px] text-ink-muted">
            Pode usar variáveis como {"{cliente}"}, {"{imobiliaria}"}, {"{etapa}"} — preenchidas quando o motor gerar a
            tarefa.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-secondary dark:text-white/70">
          <input
            type="checkbox"
            checked={regra.exigeAcaoHumana}
            onChange={(e) => setRegra((r) => ({ ...r, exigeAcaoHumana: e.target.checked }))}
            className="h-4 w-4 accent-brand-primary"
          />
          Exige ação humana (a importação nunca fecha essa tarefa sozinha — só um clique explícito)
        </label>

        {erro && <p className="text-xs text-status-danger">{erro}</p>}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary h-11 sm:h-10" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="btn-primary h-11 sm:h-10" onClick={salvar} disabled={!podeSalvar}>
          Salvar Regra
        </button>
      </div>
    </Modal>
  );
}

function CampoNumero({ label, valor, onChange }: { label: string; valor: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-ink-secondary dark:text-white/70">{label}</span>
      <input
        type="number"
        min={0}
        className="input-field"
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}
