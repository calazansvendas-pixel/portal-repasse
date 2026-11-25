"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, MapPin, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { temMenu } from "@/lib/auth/menus";
import { temPermissao } from "@/lib/auth/cargos";
import { codigoEtapa } from "@/lib/auth/roles";
import { Topbar } from "@/components/layout/Topbar";
import { Botao } from "@/components/admin/ui";
import { CartaoEtapa, pastas as contarPastas } from "@/components/organograma/CartaoEtapa";
import { PastasDaEtapa } from "@/components/organograma/PastasDaEtapa";
import { EditorEtapa } from "@/components/organograma/EditorEtapa";
import { EditorPracas } from "@/components/organograma/EditorPracas";
import { useOrganograma } from "@/lib/hooks/useOrganograma";
import { useColaboradores } from "@/lib/hooks/useColaboradores";
import {
  SEM_PRACA,
  calcularMetricas,
  etapasDescobertas,
  pracaDaPasta,
  progressoDoChecklist,
  responsavelDoPapel,
} from "@/lib/organograma/calculo";
import { BLOCOS, type EtapaOrganograma } from "@/lib/organograma/tipos";
import { formatDateBR, hojeISO } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export default function OrganogramaPage() {
  const { profile } = useAuth();
  const podeVer = !!profile && temMenu(profile, "organograma");
  const { dados, carregando, erro, recarregar, salvar, marcar } = useOrganograma(podeVer);
  // A lista de colaboradores só alimenta as sugestões de quem pode editar.
  const { colaboradores } = useColaboradores(!!profile && podeVer && temPermissao(profile, "editarParametros"));
  const [praca, setPraca] = useState("");
  const [vendo, setVendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoPracas, setEditandoPracas] = useState(false);

  const calculo = useMemo(() => {
    if (!dados) return null;
    const hoje = hojeISO();
    const doFiltro = praca ? dados.pastas.filter((p) => pracaDaPasta(p, dados.pracas) === praca) : dados.pastas;
    const geral = calcularMetricas(dados.pastas, dados.etapas, dados.pracas, hoje);
    // Etapas que existem na planilha mas ainda não no Organograma entram em "Outras etapas".
    const configuradas = new Set(dados.etapas.map((e) => e.codigo));
    const extras: EtapaOrganograma[] = Object.keys(geral)
      .filter((c) => !configuradas.has(c))
      .map((codigo) => ({
        codigo,
        bloco: 9,
        nome: (dados.nomesPlanilha[codigo] ?? codigo).replace(/^[\d.]+\s*-\s*/, ""),
        funcao: "",
        fluxoEsperado: "",
        slaDias: null,
        papeis: [],
        papelEscalonamento: null,
        selos: [],
        alerta: false,
        conferirNaEntrada: false,
        permiteCasal: false,
        modalidades: [],
      }));
    const etapas = [...dados.etapas, ...extras].sort((a, b) => a.bloco - b.bloco || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    return {
      etapas,
      doFiltro,
      geral,
      metricas: praca ? calcularMetricas(doFiltro, dados.etapas, dados.pracas, hoje) : geral,
      // A cobertura considera a base inteira, para o aviso não sumir ao filtrar uma praça.
      descobertas: etapasDescobertas(geral, dados.etapas),
      temSemPraca: dados.pastas.some((p) => pracaDaPasta(p, dados.pracas) === SEM_PRACA),
    };
  }, [dados, praca]);

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Organograma" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  const nomeDaPraca = (id: string) => dados?.pracas.find((p) => p.id === id)?.nome ?? "Sem praça";
  const rotuloEtapa = (codigo: string) => dados?.nomesPlanilha[codigo] ?? codigo;
  const paradasDe = (codigo: string) => calculo?.doFiltro.filter((p) => codigoEtapa(p.etapa) === codigo) ?? [];
  const etapaDe = (codigo: string | null) => calculo?.etapas.find((e) => e.codigo === codigo);
  const aConferir = (e: EtapaOrganograma) =>
    e.conferirNaEntrada
      ? paradasDe(e.codigo).filter((p) => {
          const { feitos, total } = progressoDoChecklist(e, dados?.checklists[p.numero]?.etapas[e.codigo]);
          return total === 0 || feitos < total;
        }).length
      : 0;

  const escalonadas = (calculo?.etapas ?? []).flatMap((e) => {
    const n = calculo?.metricas[e.codigo]?.acimaDoPrazo ?? 0;
    const papel = e.papeis.find((p) => p.id === e.papelEscalonamento);
    if (!n || !papel) return [];
    const quem = praca
      ? responsavelDoPapel(papel, praca)
      : [...new Set([papel.todas, ...Object.values(papel.porPraca)].map((x) => x.trim()).filter(Boolean))].join(", ");
    return [{ etapa: e, n, quem: quem || "sem responsável" }];
  });

  const editado = etapaDe(editando);
  const vista = etapaDe(vendo);

  return (
    <div className="flex flex-col gap-4">
      <Topbar titulo="Organograma" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary dark:text-white/60">
          Funil vivo da equipe: quem cuida de cada etapa e como as pastas estão andando.
          {dados?.ultimaPlanilha && ` Planilhas de ${formatDateBR(dados.primeiraPlanilha)} a ${formatDateBR(dados.ultimaPlanilha)}; dias contados até hoje.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {dados?.podeEditar && (
            <Botao tom="editar" onClick={() => setEditandoPracas(true)}>
              <MapPin size={14} /> Nova Praça/Cidade
            </Botao>
          )}
          <Botao onClick={() => recarregar()} disabled={carregando}>
            <RefreshCw size={14} className={cn(carregando && "animate-spin")} /> Atualizar
          </Botao>
        </div>
      </div>

      {erro && <p className="rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">{erro}</p>}
      {!dados && carregando && <p className="text-sm text-ink-muted">Carregando o funil…</p>}

      {dados && calculo && (
        <>
          <div role="group" aria-label="Filtrar por praça" className="flex flex-wrap gap-2">
            {[{ id: "", nome: "Todas as praças" }, ...dados.pracas, ...(calculo.temSemPraca ? [{ id: SEM_PRACA, nome: "Sem praça" }] : [])].map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={praca === p.id}
                onClick={() => setPraca(p.id)}
                className={cn(
                  "min-h-[36px] rounded-md border px-3 text-xs font-semibold transition-colors",
                  praca === p.id
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "border-border bg-surface text-ink-secondary hover:border-brand-primary hover:text-brand-primary dark:border-white/15 dark:bg-transparent dark:text-white/70"
                )}
              >
                {p.nome}
              </button>
            ))}
          </div>

          {calculo.descobertas.length > 0 && (
            <section data-descobertas className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-status-danger">
                <AlertTriangle size={16} /> Etapa sem responsável definido ({calculo.descobertas.length})
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {calculo.descobertas.map((d) => (
                  <li key={d.codigo}>
                    <button
                      type="button"
                      onClick={() => (dados.podeEditar ? setEditando(d.codigo) : document.querySelector(`[data-etapa="${d.codigo}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }))}
                      className="rounded-md border border-status-danger/30 bg-surface px-2.5 py-1.5 text-left text-xs text-ink-primary hover:border-status-danger dark:bg-[#1B1E17] dark:text-white"
                    >
                      <b>{rotuloEtapa(d.codigo)}</b> · {contarPastas(calculo.geral[d.codigo]?.paradas ?? 0)} hoje
                      {d.pracas && ` · sem responsável em ${d.pracas.map(nomeDaPraca).join(", ")}`}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {escalonadas.length > 0 && (
            <section data-escalonamento className="surface-card !border-status-danger/40 p-4">
              <h2 className="text-sm font-bold text-ink-primary dark:text-white">Escalonamento por prazo</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {escalonadas.map(({ etapa, n, quem }) => (
                  <li key={etapa.codigo} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-primary dark:text-white">
                    <span>
                      <b>{etapa.codigo}</b>: {contarPastas(n)} com {etapa.slaDias}+ dias. Acionar <b className="text-status-danger">{quem}</b>.
                    </span>
                    <Botao tom="editar" onClick={() => setVendo(etapa.codigo)}>
                      Ver pastas e checklist
                    </Botao>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Object.entries(BLOCOS)
            .map(([n, nome]) => ({ n: Number(n), nome, etapas: calculo.etapas.filter((e) => e.bloco === Number(n)) }))
            .filter((b) => b.etapas.length)
            .map((b, i) => (
              <section key={b.n} className="flex flex-col gap-3">
                {i > 0 && <ChevronDown aria-hidden size={22} className="mx-auto text-brand-primary" />}
                <h2 className="text-base font-bold text-ink-primary dark:text-white">
                  Bloco {b.n} — {b.nome}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {b.etapas.map((e) => (
                    <CartaoEtapa
                      key={e.codigo}
                      etapa={e}
                      nomePlanilha={dados.nomesPlanilha[e.codigo]}
                      metricas={calculo.metricas[e.codigo]}
                      descoberta={calculo.descobertas.find((d) => d.codigo === e.codigo)}
                      aConferir={aConferir(e)}
                      praca={praca}
                      pracas={dados.pracas}
                      nomeDaPraca={nomeDaPraca}
                      rotuloEtapa={rotuloEtapa}
                      onVerPastas={() => setVendo(e.codigo)}
                      onEditar={dados.podeEditar ? () => setEditando(e.codigo) : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
        </>
      )}

      {dados && vista && (
        <PastasDaEtapa
          etapa={vista}
          paradas={paradasDe(vista.codigo)}
          checklists={dados.checklists}
          pracas={dados.pracas}
          nomeDaPraca={nomeDaPraca}
          onMarcar={(numero, mudanca) => marcar(numero, vista.codigo, mudanca)}
          onFechar={() => setVendo(null)}
        />
      )}
      {dados && editado && (
        <EditorEtapa
          key={editado.codigo}
          etapa={editado}
          pracas={dados.pracas}
          nomes={[...new Set(["Correspondente CAIXA", ...colaboradores.map((c) => c.nome)])]}
          onSalvar={(etapa) => salvar({ etapa })}
          onFechar={() => setEditando(null)}
        />
      )}
      {dados && editandoPracas && <EditorPracas pracas={dados.pracas} onSalvar={(pracas) => salvar({ pracas })} onFechar={() => setEditandoPracas(false)} />}
    </div>
  );
}
