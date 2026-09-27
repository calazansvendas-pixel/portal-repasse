"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeVerRelatoriosGerais, CIDADES_FILTRO, normalize } from "@/lib/auth/roles";
import { useRelatorioImobiliarias } from "@/lib/hooks/useRelatorioImobiliarias";
import { Topbar } from "@/components/layout/Topbar";
import { TrajetoPasta, ObservacaoChecklist } from "@/components/tarefas/partesCard";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { formatDateBR } from "@/lib/utils/dates";
import type { PastaRelatorio } from "@/lib/server/relatorioImobiliarias";

const TODAS = "";
/** Ordenação padrão: pelo total de pastas do parceiro, sem olhar etapa nenhuma. */
const VOLUME_TOTAL = "";

type ModoEtapa = "atual" | "historico";

export default function RelatorioImobiliariasPage() {
  const { profile } = useAuth();
  const podeVer = !!profile && podeVerRelatoriosGerais(profile.role);
  const { pastas, parcial, loading, erro } = useRelatorioImobiliarias(podeVer);

  const [imobiliaria, setImobiliaria] = useState(TODAS);
  const [cidade, setCidade] = useState(TODAS);
  const [produto, setProduto] = useState(TODAS);
  const [etapaGargalo, setEtapaGargalo] = useState(VOLUME_TOTAL);
  const [modoEtapa, setModoEtapa] = useState<ModoEtapa>("atual");

  const imobiliarias = useMemo(
    () => [...new Set(pastas.map((p) => p.responsavel?.trim()).filter(Boolean))].sort() as string[],
    [pastas]
  );
  // "Produto": coluna própria "Empreendimento" da planilha — nome do produto, desvinculado da cidade.
  const produtos = useMemo(
    () => [...new Set(pastas.map((p) => p.produto?.trim()).filter(Boolean))].sort() as string[],
    [pastas]
  );
  // Etapas do funil lidas dinamicamente das próprias pastas (nunca uma lista fixa no código).
  const etapas = useMemo(
    () => [...new Set(pastas.map((p) => p.etapa?.trim()).filter(Boolean))].sort() as string[],
    [pastas]
  );

  // Filtro absoluto de etapa: com uma etapa escolhida, só os dois modos abaixo decidem
  // quem fica na tela — não é mais um critério de ordenação, some quem não bate.
  const passaNaEtapa = (p: PastaRelatorio) => {
    if (!etapaGargalo) return true;
    if (modoEtapa === "atual") return p.etapa?.trim() === etapaGargalo;
    return (p.historicoEtapas ?? []).some((h) => h.etapa?.trim() === etapaGargalo);
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
  }, [pastas, imobiliaria, cidade, produto, etapaGargalo, modoEtapa]);

  // Agrupamento por imobiliária + ordenação: tudo em memória, sobre o que a API já trouxe
  // (nenhuma leitura extra no Firestore por causa do agrupamento, da contagem ou da troca de etapa).
  // Imobiliária sem nenhuma pasta depois do filtro não entra no mapa: nada de bloco vazio na tela.
  const grupos = useMemo(() => {
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
      <p className="text-sm text-ink-secondary dark:text-white/60">
        Consulta somente leitura, para prestação de contas aos parceiros: andamento e histórico completo de cada
        pasta. Nenhuma ação de status pode ser feita nesta tela.
      </p>

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

        <label className="flex w-full flex-col gap-1.5 sm:w-72">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Analisar Gargalo por Etapa</span>
          <select className="input-field" value={etapaGargalo} onChange={(e) => setEtapaGargalo(e.target.value)}>
            <option value={VOLUME_TOTAL}>Volume Total de Pastas</option>
            {etapas.map((e) => (
              <option key={e} value={e}>
                Etapa {e}
              </option>
            ))}
          </select>
        </label>

        {etapaGargalo && (
          <div role="radiogroup" aria-label="Modo do filtro de etapa" className="flex w-full flex-col gap-1.5 sm:w-auto">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Modo</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-ink-secondary dark:text-white/70">
                <input
                  type="radio"
                  name="modoEtapa"
                  checked={modoEtapa === "atual"}
                  onChange={() => setModoEtapa("atual")}
                  className="accent-brand-primary"
                />
                Estão na etapa agora
              </label>
              <label className="flex items-center gap-1.5 text-xs text-ink-secondary dark:text-white/70">
                <input
                  type="radio"
                  name="modoEtapa"
                  checked={modoEtapa === "historico"}
                  onChange={() => setModoEtapa("historico")}
                  className="accent-brand-primary"
                />
                Já passaram por esta etapa
              </label>
            </div>
          </div>
        )}

        <p className="text-xs text-ink-muted">
          {filtradas.length} de {pastas.length} pasta(s) · {grupos.length} imobiliária(s)
        </p>
      </div>

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
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <GrupoImobiliaria key={grupo.nome} grupo={grupo} />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoImobiliaria({ grupo }: { grupo: { nome: string; lista: PastaRelatorio[]; total: number } }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="surface-card flex flex-wrap items-center justify-between gap-2 border-l-4 border-brand-primary px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Building2 size={18} className="shrink-0 text-brand-primary" />
          <h2 className="truncate text-base font-bold text-ink-primary dark:text-white">{grupo.nome}</h2>
        </div>
        <span className="shrink-0 text-xs text-ink-secondary dark:text-white/60">
          <span className="font-semibold text-ink-primary dark:text-white">{grupo.total}</span> pasta(s)
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {grupo.lista.map((p) => (
          <CardPasta key={p.numero} pasta={p} />
        ))}
      </div>
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
