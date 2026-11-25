"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ChevronRight, Filter, X } from "lucide-react";
import { ComboboxClientes } from "@/components/auditoria/ComboboxClientes";
import { FunilDestinos } from "@/components/auditoria/FunilDestinos";
import { codigoEtapa } from "@/lib/auth/roles";
import { agruparClientes, filtrarClientes, type ClienteDossie } from "@/lib/utils/buscaClientes";
import { formatarCpfCnpj, somenteDigitos } from "@/lib/utils/cpf";
import { formatDateBR, hojeISO } from "@/lib/utils/dates";
import {
  SEM_SELECAO,
  chaveCliente,
  descreverFiltros,
  filtrarPorSelecao,
  fraseSelecao,
  montarFunil,
  pontas,
  textoResumo,
  type Dimensao,
  type Selecao,
} from "@/lib/utils/funilDestinos";
import {
  SEM_FILTROS,
  avaliarPasta,
  temFiltro,
  type Correspondencia,
  type FiltrosMovimentacao,
  type PastaDossie,
} from "@/lib/utils/movimentacoes";
import type { BaseDossie } from "@/lib/server/dossieCliente";
import { cn } from "@/lib/utils/cn";

interface Linha extends Correspondencia {
  pasta: PastaDossie;
  cliente: ClienteDossie;
}

const ordemNatural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const comoCliente = (p: PastaDossie): ClienteDossie => agruparClientes([p])[0];

/** "yyyy-MM-dd" de N dias antes da data informada. */
function diasAntes(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Card de filtros do Dossiê (cliente, etapa atual, saiu da, entrou na, período) e a lista de
 * resultados, com o funil de destinos entre os dois. `children` é a área do dossiê aberto, controlada pela página.
 */
export function SuperfiltrosDossie({
  base,
  podeExportar,
  carregando,
  erro,
  onRecarregar,
  onAbrir,
  onFechar,
  children,
}: {
  base: BaseDossie;
  podeExportar: boolean;
  carregando: boolean;
  erro: string | null;
  onRecarregar: () => void;
  onAbrir: (numero: string) => void;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [cliente, setCliente] = useState<ClienteDossie | null>(null);
  const [filtros, setFiltros] = useState<FiltrosMovimentacao>(SEM_FILTROS);
  /** Resultado do último "Filtrar / Buscar", com os filtros usados; null = ainda não filtrou. */
  const [busca, setBusca] = useState<{ linhas: Linha[]; filtros: FiltrosMovimentacao; cliente: string } | null>(null);
  /** Origem e destino escolhidos no funil, e a visão dos blocos. */
  const [selecao, setSelecao] = useState<Selecao>(SEM_SELECAO);
  const [visao, setVisao] = useState<Dimensao>("destino");
  const [recolhido, setRecolhido] = useState(false);
  /** true = há um dossiê aberto (a lista, se existir, fica guardada para o "Voltar"). */
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const mudar = (campos: Partial<FiltrosMovimentacao>) => {
    setFiltros((f) => ({ ...f, ...campos }));
    setAviso(null);
  };

  // O campo de cliente acompanha os filtros de etapa e período, antes mesmo de clicar em Filtrar.
  const pastasQueAtendem = useMemo(
    () => (temFiltro(filtros) ? base.pastas.filter((p) => avaliarPasta(p, filtros)) : base.pastas),
    [base.pastas, filtros]
  );
  const clientes = useMemo(() => agruparClientes(pastasQueAtendem), [pastasQueAtendem]);

  const codigos = useMemo(() => {
    const atual = new Set<string>();
    const saiu = new Set<string>();
    const entrou = new Set<string>();
    for (const p of base.pastas) {
      const codigo = codigoEtapa(p.etapa ?? "");
      if (codigo) atual.add(codigo);
      for (const m of p.movimentos) {
        if (m.de) saiu.add(m.de);
        entrou.add(m.para);
      }
    }
    return { atual: [...atual].sort(ordemNatural), saiu: [...saiu].sort(ordemNatural), entrou: [...entrou].sort(ordemNatural) };
  }, [base.pastas]);

  const linhas = busca?.linhas ?? null;
  const funil = useMemo(
    () => (busca?.linhas.length ? montarFunil(busca.linhas, busca.filtros, base.etapas, visao, selecao) : null),
    [busca, base.etapas, visao, selecao]
  );
  const visiveis = useMemo(
    () => (busca ? filtrarPorSelecao(busca.linhas, busca.filtros, selecao) : []),
    [busca, selecao]
  );

  function guardarBusca(nova: typeof busca) {
    setBusca(nova);
    setSelecao(SEM_SELECAO);
    setVisao("destino");
  }

  /** Filtros do último "Filtrar" (não o rascunho do formulário), para o texto e a planilha. */
  const filtrosDoRecorte = () => (busca ? descreverFiltros(busca.filtros, base.etapas, busca.cliente) : []);
  /** Ranking do recorte inteiro, sem os seletores. */
  const funilCompleto = () => (busca ? montarFunil(busca.linhas, busca.filtros, base.etapas, visao) : null);

  async function copiarResumo() {
    const completo = funilCompleto();
    if (completo && funil) {
      await navigator.clipboard.writeText(textoResumo(completo, filtrosDoRecorte(), fraseSelecao(funil, selecao)));
    }
  }

  /** "depois → 5.03": no filtro só de entrada, o destino não aparece na movimentação listada. */
  function movimentacao(l: Linha): string {
    const texto = l.outras > 0 ? `${l.descricao} (+${l.outras})` : l.descricao;
    if (!busca || !l.movimento) return texto;
    const { destino } = pontas(l, busca.filtros);
    return destino === l.movimento.para || busca.filtros.saiu ? texto : `${texto} · depois → ${destino}`;
  }

  async function exportarRecorte() {
    const completo = funilCompleto();
    if (!completo || !funil) return;
    const filtrosUsados = filtrosDoRecorte();
    const frase = fraseSelecao(funil, selecao);
    if (frase) filtrosUsados.push(["Lista de clientes restrita à seleção", frase]);
    const { exportarFunilXlsx } = await import("@/lib/services/exportarFunilXlsx");
    await exportarFunilXlsx(
      completo,
      filtrosUsados,
      visiveis.map((l) => ({
        cliente: l.cliente.clienteNome,
        cpfCnpj: l.cliente.cpfCnpj ? formatarCpfCnpj(l.cliente.cpfCnpj) : "",
        empreendimento: l.cliente.produto || "",
        etapaAtual: l.cliente.etapa || "",
        movimentacao: movimentacao(l),
        data: l.data,
      })),
      `resumo-movimentacao-${hojeISO()}.xlsx`
    );
  }

  function abrirDossie(numero: string) {
    setAberto(true);
    onAbrir(numero);
  }

  function filtrar(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    if (filtros.de && filtros.ate && filtros.de > filtros.ate) {
      return setAviso('A data "De" precisa ser anterior ou igual à data "Até".');
    }
    if (!temFiltro(filtros) && !texto.trim()) return setAviso("Preencha ao menos um filtro ou escolha um cliente.");

    // Cliente escolhido: todas as pastas daquele CPF/CNPJ. Só texto digitado: nome ou documento.
    let candidatas = base.pastas;
    if (cliente) {
      const documento = somenteDigitos(cliente.cpfCnpj);
      candidatas = candidatas.filter((p) => (documento ? somenteDigitos(p.cpfCnpj) === documento : p.numero === cliente.numero));
    } else if (texto.trim()) {
      const numeros = new Set(filtrarClientes(candidatas.map(comoCliente), texto).map((c) => c.numero));
      candidatas = candidatas.filter((p) => numeros.has(p.numero));
    }

    const achadas: Linha[] = candidatas
      .flatMap((pasta) => {
        const c = avaliarPasta(pasta, filtros);
        return c ? [{ ...c, pasta, cliente: comoCliente(pasta) }] : [];
      })
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || a.cliente.clienteNome.localeCompare(b.cliente.clienteNome, "pt-BR"));

    guardarBusca({ linhas: achadas, filtros, cliente: cliente?.clienteNome ?? texto.trim() });
    if (achadas.length === 1) abrirDossie(achadas[0].pasta.numero);
    else {
      setAberto(false);
      onFechar();
    }
  }

  function limparTudo() {
    setTexto("");
    setCliente(null);
    setFiltros(SEM_FILTROS);
    guardarBusca(null);
    setAberto(false);
    setAviso(null);
    onFechar();
  }

  const variasLinhas = !!linhas && linhas.length > 1;
  const totalClientes = new Set(visiveis.map((l) => chaveCliente(l.pasta))).size;
  const hoje = hojeISO();
  const atalhos = [
    { rotulo: "Hoje", de: hoje, ate: hoje },
    { rotulo: "Últimos 7 dias", de: diasAntes(hoje, 6), ate: hoje },
    { rotulo: "Este mês", de: `${hoje.slice(0, 8)}01`, ate: hoje },
  ];

  const seletorEtapa = (rotulo: string, campo: "etapaAtual" | "saiu" | "entrou", vazio: string, opcoes: string[]) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{rotulo}</span>
      <select className="input-field" value={filtros[campo]} onChange={(e) => mudar({ [campo]: e.target.value })}>
        <option value="">{vazio}</option>
        {opcoes.map((codigo) => (
          <option key={codigo} value={codigo}>
            {base.etapas[codigo] ?? codigo}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <form onSubmit={filtrar} className="surface-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cliente (nome ou CPF/CNPJ)</span>
            <ComboboxClientes
              clientes={clientes}
              carregando={carregando}
              erro={erro}
              aviso={temFiltro(filtros) ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} atendem aos filtros` : null}
              texto={texto}
              onTexto={(t) => {
                setTexto(t);
                setCliente(null);
                setAviso(null);
              }}
              onEscolher={(c) => {
                setCliente(c);
                setTexto(c.clienteNome);
                guardarBusca(null);
                abrirDossie(c.numero);
              }}
              onLimpar={() => {
                setCliente(null);
                guardarBusca(null);
                setAberto(false);
                onFechar();
              }}
              onAbrir={() => {
                if (erro) onRecarregar();
              }}
            />
          </div>
          {seletorEtapa("Etapa atual", "etapaAtual", "Todas as etapas", codigos.atual)}
          {seletorEtapa("Saiu da etapa", "saiu", "Qualquer etapa", codigos.saiu)}
          {seletorEtapa("Entrou na etapa", "entrou", "Qualquer etapa", codigos.entrou)}

          <fieldset className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Período das movimentações</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["de", "ate"] as const).map((campo) => (
                <label key={campo} className="flex min-w-0 items-center gap-2 text-xs font-semibold text-ink-secondary dark:text-white/70">
                  <span className="w-7 shrink-0">{campo === "de" ? "De" : "Até"}</span>
                  <input type="date" className="input-field min-w-0 flex-1" value={filtros[campo]} onChange={(e) => mudar({ [campo]: e.target.value })} />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {atalhos.map((a) => {
                const ligado = filtros.de === a.de && filtros.ate === a.ate;
                return (
                  <button
                    key={a.rotulo}
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => mudar(ligado ? { de: "", ate: "" } : { de: a.de, ate: a.ate })}
                    className={cn(
                      "min-h-[32px] rounded-md border px-3 text-xs font-semibold transition-colors",
                      ligado
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-border text-ink-secondary hover:border-brand-primary hover:text-brand-primary dark:border-white/15 dark:text-white/70"
                    )}
                  >
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 dark:border-white/10">
          <p className="text-xs text-ink-muted">
            {base.primeiraPlanilha && base.ultimaPlanilha
              ? `Movimentações das planilhas de ${formatDateBR(base.primeiraPlanilha)} a ${formatDateBR(base.ultimaPlanilha)}.`
              : carregando
                ? "Carregando a base…"
                : ""}
          </p>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={limparTudo}>
              <X size={16} />
              Limpar Filtros
            </button>
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={carregando}>
              <Filter size={16} />
              Filtrar / Buscar
            </button>
          </div>
        </div>
      </form>

      {(aviso || erro) && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{aviso ?? erro}</p>
        </div>
      )}

      {linhas && linhas.length === 0 && !aberto && (
        <div className="surface-card p-8 text-center text-sm text-ink-muted">Nenhum cliente encontrado com esses filtros.</div>
      )}

      {/* Com um resultado só o dossiê abre direto: o card continua disponível, acima dele. */}
      {funil && (!aberto || !variasLinhas) && (
        <FunilDestinos
          funil={funil}
          selecao={selecao}
          onSelecionar={setSelecao}
          onVisao={setVisao}
          recolhido={recolhido}
          onRecolher={() => setRecolhido((r) => !r)}
          onCopiar={copiarResumo}
          onExportar={podeExportar ? exportarRecorte : undefined}
        />
      )}

      {variasLinhas && !aberto && (
        <section className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5">
            <h2 className="text-sm font-bold text-ink-primary dark:text-white">Resultados Encontrados</h2>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-900">
              {totalClientes} cliente{totalClientes === 1 ? "" : "s"} encontrado{totalClientes === 1 ? "" : "s"}
              {visiveis.length !== totalClientes && ` · ${visiveis.length} pastas`}
            </span>
          </div>
          <div className="hidden border-y border-border px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-muted lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_84px] lg:gap-3 dark:border-white/10">
            <span>Cliente</span>
            <span>CPF/CNPJ</span>
            <span>Empreendimento</span>
            <span>Etapa atual</span>
            <span>Movimentação no período</span>
            <span>Data</span>
          </div>
          <ul className="divide-y divide-border border-t border-border lg:border-t-0 dark:divide-white/10 dark:border-white/10">
            {visiveis.map((l) => (
              <li key={l.pasta.numero}>
                <button
                  type="button"
                  onClick={() => abrirDossie(l.pasta.numero)}
                  className="flex w-full flex-col gap-1.5 px-4 py-3 text-left text-xs transition-colors hover:bg-surface-soft sm:px-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_84px] lg:items-center lg:gap-3 dark:hover:bg-white/5"
                >
                  <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-slate-900 dark:text-white">
                    <span className="truncate">{l.cliente.clienteNome}</span>
                    <ChevronRight size={14} className="shrink-0 text-ink-muted lg:hidden" />
                  </span>
                  <Celula rotulo="CPF/CNPJ">{l.cliente.cpfCnpj ? formatarCpfCnpj(l.cliente.cpfCnpj) : "—"}</Celula>
                  <Celula rotulo="Empreendimento">{l.cliente.produto || "—"}</Celula>
                  <Celula rotulo="Etapa atual">{l.cliente.etapa || "—"}</Celula>
                  <Celula rotulo="Movimentação">{movimentacao(l)}</Celula>
                  <Celula rotulo="Data">{l.data ? formatDateBR(l.data) : "—"}</Celula>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aberto && variasLinhas && (
        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => {
            setAberto(false);
            onFechar();
          }}
        >
          <ArrowLeft size={16} />
          Voltar para a lista de resultados
        </button>
      )}

      {aberto && children}

      {!linhas && !aberto && !erro && (
        <div className="surface-card p-8 text-center text-sm text-ink-muted">
          Escolha um cliente na lista ou combine os filtros de etapa e período.
        </div>
      )}
    </>
  );
}

/** No celular cada valor ganha o nome da coluna. */
function Celula({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0 break-words text-ink-secondary dark:text-white/70">
      <span className="mr-1 text-ink-muted lg:hidden">{rotulo}:</span>
      {children}
    </span>
  );
}
