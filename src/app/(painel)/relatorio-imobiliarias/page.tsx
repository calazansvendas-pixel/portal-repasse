"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Building2, ChevronDown, ChevronRight, Printer } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeVerRelatoriosGerais, CIDADES_FILTRO, codigoEtapa, normalize } from "@/lib/auth/roles";
import { useRelatorioImobiliarias } from "@/lib/hooks/useRelatorioImobiliarias";
import { Topbar } from "@/components/layout/Topbar";
import { TrajetoPasta, ObservacaoChecklist } from "@/components/tarefas/partesCard";
import { RelatorioFiltradoImobiliarias } from "@/components/dashboard/RelatorioFiltradoImobiliarias";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { formatDateBR } from "@/lib/utils/dates";
import type { EtapaHistorico } from "@/lib/types";
import type { GrupoImobiliariaDados, PastaRelatorio } from "@/lib/server/relatorioImobiliarias";

const TODAS = "";

/** Quantos dias CONSECUTIVOS a pasta já permaneceu nesta etapa, no maior trecho encontrado em
 * todo o seu trajeto — não só agora: uma pasta que passou 8 dias na 1.17 em março e hoje está em
 * outra etapa ainda conta, se o filtro pedir "1.17, 5+ dias". */
function maiorPermanenciaNaEtapa(historico: EtapaHistorico[] | undefined, etapaCodigo: string): number {
  if (!historico?.length) return 0;
  let maior = 0;
  let atual = 0;
  for (const h of historico) {
    if (codigoEtapa(h.etapa ?? "") === etapaCodigo) {
      atual++;
      if (atual > maior) maior = atual;
    } else {
      atual = 0;
    }
  }
  return maior;
}

export default function RelatorioImobiliariasPage() {
  const { profile } = useAuth();
  const podeVer = !!profile && podeVerRelatoriosGerais(profile.role);
  const { pastas, parcial, loading, erro } = useRelatorioImobiliarias(podeVer);

  const [imobiliaria, setImobiliaria] = useState(TODAS);
  const [cidade, setCidade] = useState(TODAS);
  const [produto, setProduto] = useState(TODAS);
  const [etapaCodigo, setEtapaCodigo] = useState(TODAS);
  const [diasPermanencia, setDiasPermanencia] = useState<number | "">("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  const imobiliarias = useMemo(
    () => [...new Set(pastas.map((p) => p.responsavel?.trim()).filter(Boolean))].sort() as string[],
    [pastas]
  );
  // "Produto": coluna própria "Empreendimento" da planilha — nome do produto, desvinculado da cidade.
  const produtos = useMemo(
    () => [...new Set(pastas.map((p) => p.produto?.trim()).filter(Boolean))].sort() as string[],
    [pastas]
  );
  // Etapas do funil, por CÓDIGO (ex.: "1.17"), extraídas tanto da etapa atual de cada pasta quanto
  // do histórico completo — uma etapa pela qual ninguém está passando hoje, mas por onde alguma
  // pasta já passou, continua aparecendo no filtro. Nunca uma lista fixa no código.
  const etapas = useMemo(() => {
    const porCodigo = new Map<string, string>();
    const registrar = (etapaRaw: string | null | undefined) => {
      const etapa = etapaRaw?.trim();
      if (!etapa) return;
      const codigo = codigoEtapa(etapa);
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, etapa);
    };
    for (const p of pastas) {
      registrar(p.etapa);
      for (const h of p.historicoEtapas ?? []) registrar(h.etapa);
    }
    return [...porCodigo.entries()]
      .map(([codigo, label]) => ({ codigo, label }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  }, [pastas]);

  // Filtro de gargalo real: com uma etapa escolhida, só entra quem já permaneceu nela, em
  // qualquer momento do trajeto, por pelo menos "diasPermanencia" dias consecutivos (mínimo 1 —
  // sem etapa escolhida, o campo de dias fica sem efeito).
  const passaNaEtapa = (p: PastaRelatorio) => {
    if (!etapaCodigo) return true;
    const minimo = Math.max(1, Number(diasPermanencia) || 0);
    return maiorPermanenciaNaEtapa(p.historicoEtapas, etapaCodigo) >= minimo;
  };

  const filtradas = useMemo(() => {
    return pastas.filter((p) => {
      if (imobiliaria && p.responsavel?.trim() !== imobiliaria) return false;
      if (produto && p.produto?.trim() !== produto) return false;
      if (cidade && !normalize(p.cidade ?? "").includes(cidade)) return false;
      if (!passaNaEtapa(p)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastas, imobiliaria, cidade, produto, etapaCodigo, diasPermanencia]);

  // Agrupamento por imobiliária + ordenação: tudo em memória, sobre o que a API já trouxe
  // (nenhuma leitura extra no Firestore por causa do agrupamento, da contagem ou da troca de etapa).
  // Imobiliária sem nenhuma pasta depois do filtro não entra no mapa: nada de bloco vazio na tela.
  const grupos = useMemo<GrupoImobiliariaDados[]>(() => {
    const porImobiliaria = new Map<string, PastaRelatorio[]>();
    for (const p of filtradas) {
      const chave = p.responsavel?.trim() || "Imobiliária não informada";
      const lista = porImobiliaria.get(chave) ?? [];
      lista.push(p);
      porImobiliaria.set(chave, lista);
    }

    const comContagem = [...porImobiliaria.entries()]
      .map(([nome, lista]) => ({ nome, lista, total: lista.length }))
      .filter((g) => g.total > 0);

    return comContagem.sort((a, b) => b.total - a.total);
  }, [filtradas]);

  function alternarGrupo(nome: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });
  }

  const etapaSelecionada = etapas.find((e) => e.codigo === etapaCodigo) ?? null;
  const filtrosResumo = [
    imobiliaria && `Imobiliária: ${imobiliaria}`,
    cidade && `Cidade: ${CIDADES_FILTRO.find((c) => c.chave === cidade)?.label ?? cidade}`,
    produto && `Produto: ${produto}`,
    etapaSelecionada && `Etapa: ${etapaSelecionada.label} · mínimo ${Math.max(1, Number(diasPermanencia) || 0)} dia(s) consecutivos`,
  ].filter((v): v is string => !!v);

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Relatório Imobiliárias" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Relatório Imobiliárias" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary dark:text-white/60">
          Consulta somente leitura, para prestação de contas aos parceiros: andamento e histórico completo de cada
          pasta. Nenhuma ação de status pode ser feita nesta tela.
        </p>
        <button type="button" className="btn-secondary h-10 shrink-0" onClick={() => setRelatorioAberto(true)} disabled={grupos.length === 0}>
          <Printer size={16} />
          Emitir Relatório Executivo
        </button>
      </div>

      <div className="surface-card flex flex-wrap items-end gap-3 p-3 sm:gap-4 sm:p-4">
        <label className="flex w-full flex-col gap-1.5 sm:w-56">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Imobiliária</span>
          <select className="input-field" value={imobiliaria} onChange={(e) => setImobiliaria(e.target.value)}>
            <option value={TODAS}>Todas as imobiliárias</option>
            {imobiliarias.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1.5 sm:w-48">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cidade</span>
          <select className="input-field" value={cidade} onChange={(e) => setCidade(e.target.value)}>
            <option value={TODAS}>Todas as cidades</option>
            {CIDADES_FILTRO.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1.5 sm:w-64">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Produto</span>
          <select className="input-field" value={produto} onChange={(e) => setProduto(e.target.value)}>
            <option value={TODAS}>Todos</option>
            {produtos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1.5 sm:w-64">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Gargalo real · Etapa</span>
          <select className="input-field" value={etapaCodigo} onChange={(e) => setEtapaCodigo(e.target.value)}>
            <option value={TODAS}>Nenhuma (volume total de pastas)</option>
            {etapas.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1.5 sm:w-48">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Dias de permanência (mín.)</span>
          <input
            type="number"
            min={0}
            placeholder="ex.: 5"
            className="input-field"
            value={diasPermanencia}
            disabled={!etapaCodigo}
            onChange={(e) => setDiasPermanencia(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
          />
        </label>

        <p className="text-xs text-ink-muted">
          {filtradas.length} de {pastas.length} pasta(s) · {grupos.length} imobiliária(s)
        </p>
      </div>

      {etapaCodigo && (
        <p className="text-xs text-ink-muted">
          Mostrando pastas que já permaneceram {Math.max(1, Number(diasPermanencia) || 0)}+ dia(s) consecutivos na etapa{" "}
          {etapaSelecionada?.label ?? etapaCodigo}, em qualquer momento do trajeto — não só quem está nela hoje.
        </p>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{erro}</p>
        </div>
      )}

      {parcial && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Dados parciais.</span> O limite de {parcial.toLocaleString("pt-BR")}{" "}
            pastas foi atingido. Refine os filtros para uma leitura completa.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted">Carregando pastas…</p>
      ) : grupos.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-ink-muted">
          Nenhuma pasta encontrada para os filtros selecionados.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((grupo) => (
            <GrupoImobiliaria
              key={grupo.nome}
              grupo={grupo}
              aberto={abertos.has(grupo.nome)}
              onToggle={() => alternarGrupo(grupo.nome)}
            />
          ))}
        </div>
      )}

      {relatorioAberto && (
        <RelatorioFiltradoImobiliarias grupos={grupos} filtros={filtrosResumo} onFechar={() => setRelatorioAberto(false)} />
      )}
    </div>
  );
}

/** Barra colapsável (acordeão): fechada por padrão — os cards de pastas só são MONTADOS no DOM
 * quando a imobiliária é expandida (nunca renderizados escondidos via CSS), para não pagar o
 * custo de montar centenas de cards que ninguém vai abrir. */
function GrupoImobiliaria({
  grupo,
  aberto,
  onToggle,
}: {
  grupo: GrupoImobiliariaDados;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="surface-card flex w-full flex-wrap items-center justify-between gap-2 border-l-4 border-brand-primary px-4 py-3 text-left transition-colors hover:bg-ink-primary/[0.02] dark:hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-2">
          {aberto ? (
            <ChevronDown size={16} className="shrink-0 text-ink-muted" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-ink-muted" />
          )}
          <Building2 size={18} className="shrink-0 text-brand-primary" />
          <h2 className="truncate text-base font-bold text-ink-primary dark:text-white">{grupo.nome}</h2>
        </div>
        <span className="shrink-0 text-xs text-ink-secondary dark:text-white/60">
          <span className="font-semibold text-ink-primary dark:text-white">{grupo.total}</span> pasta(s)
        </span>
      </button>

      {aberto && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {grupo.lista.map((p) => (
            <CardPasta key={p.numero} pasta={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardPasta({ pasta }: { pasta: PastaRelatorio }) {
  return (
    <div className="surface-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary dark:text-white">
            {pasta.clienteNome || `Pasta ${pasta.numero}`}
          </p>
          <p className="truncate text-xs text-ink-muted">Pasta {pasta.numero}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${SLA_BADGE_CLASSES[pasta.slaStatus]}`}>
          {SLA_LABEL[pasta.slaStatus]}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary dark:text-white/60">
        <span>
          <span className="text-ink-muted">Cidade:</span> {pasta.cidade || "—"}
        </span>
        <span>
          <span className="text-ink-muted">Produto:</span> {pasta.produto || "—"}
        </span>
        <span>
          <span className="text-ink-muted">Etapa atual:</span> {pasta.etapa || "—"}
        </span>
        <span>
          <span className="text-ink-muted">Prazo:</span> {formatDateBR(pasta.prazoEtapa)}
        </span>
        {pasta.arquivada && <span className="font-semibold text-status-success">Venda concluída</span>}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Linha do tempo</p>
        <TrajetoPasta dados={{ dataEntrada: pasta.dataEntrada, etapa: pasta.etapa, historicoEtapas: pasta.historicoEtapas }} />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Observação atual</p>
        {pasta.observacao ? (
          <ObservacaoChecklist texto={pasta.observacao} />
        ) : (
          <p className="text-xs text-ink-muted">Sem observação.</p>
        )}
      </div>
    </div>
  );
}
