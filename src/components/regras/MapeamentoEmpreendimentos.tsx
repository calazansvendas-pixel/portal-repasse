"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { normalize, type AtribuicaoEmpreendimento, type MatrizEmpreendimentos } from "@/lib/auth/roles";
import { useColaboradores } from "@/lib/hooks/useColaboradores";
import { useEmpreendimentosEEtapas } from "@/lib/hooks/useEmpreendimentosEEtapas";
import { useMapeamentoEmpreendimentos } from "@/lib/hooks/useMapeamentoEmpreendimentos";
import { salvarMapeamentoEmpreendimentos } from "@/lib/services/mapeamentoEmpreendimentosService";
import type { Quadro } from "@/lib/types";
import type { Colaborador } from "@/app/api/colaboradores/route";

/** Quadro/coluna do colaborador — null (Gerência) não entra na lista, pois não tem coluna no
 * painel (mesmo critério de quadroDoColaborador em ModaisTarefa.tsx). */
function quadroDoColaborador(c: Colaborador): Quadro | null {
  if (c.role === "assistente") return c.praca ?? null;
  if (c.role === "coordenador") return "coordenador";
  if (c.role === "analista") return "analista";
  return null;
}

interface Linha {
  id: number; // só para key do React — nunca gravado
  colaboradorId: string;
  empreendimento: string; // nome original (não normalizado), igual ao extraído de "registros"
  etapas: string[]; // códigos de etapa selecionados para este vínculo
}

/** Reconstrói as linhas de edição a partir da matriz salva — tenta casar a chave normalizada com
 * um nome de empreendimento ainda existente na planilha (para exibir o nome original no select);
 * se o empreendimento não aparece mais nas pastas importadas, mostra a própria chave salva. */
function linhasDaMatriz(matriz: MatrizEmpreendimentos, produtos: string[]): Linha[] {
  const linhas: Linha[] = [];
  let proximoId = 0;
  for (const [chave, atribuicoes] of Object.entries(matriz)) {
    const nomeOriginal = produtos.find((p) => normalize(p) === chave) ?? chave;
    for (const atribuicao of atribuicoes ?? []) {
      linhas.push({
        id: proximoId++,
        colaboradorId: atribuicao.colaboradorId,
        empreendimento: nomeOriginal,
        etapas: atribuicao.etapas,
      });
    }
  }
  return linhas;
}

/**
 * Atribuição de tarefas por Empreendimento + Etapa (Gerência): vincula um colaborador a um ou
 * mais empreendimentos e, dentro de cada um, só às etapas marcadas. Empreendimentos e etapas são
 * extraídos automaticamente das pastas já importadas — não há cadastro manual de nenhum dos dois.
 *
 * Roteamento em cascata: 1) se a pasta pertence a um empreendimento vinculado E a etapa dela está
 * marcada para aquele colaborador, a tarefa vai direto para ele; 2) sem vínculo que cubra aquela
 * etapa específica (empreendimento sem vínculo algum, ou vínculo que não marca aquela etapa), a
 * tarefa cai no roteamento padrão por cidade/etapa, como sempre.
 */
export function MapeamentoEmpreendimentos() {
  const { firebaseUser } = useAuth();
  const { overrides, loading: carregandoMatriz } = useMapeamentoEmpreendimentos();
  const { produtos, etapas, loading: carregandoExtrato } = useEmpreendimentosEEtapas();
  const { colaboradores } = useColaboradores(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [proximoId, setProximoId] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const loading = carregandoMatriz || carregandoExtrato;
  const selecionaveis = colaboradores.filter((c) => quadroDoColaborador(c) !== null);

  // O rascunho local só nasce do Firestore uma vez (quando os dois carregamentos terminam) —
  // depois disso a Gerência edita livremente sem um listener em tempo real sobrescrever o que ela
  // ainda não salvou (mesmo motivo de MapeamentoPracas.tsx).
  useEffect(() => {
    if (loading) return;
    const iniciais = linhasDaMatriz(overrides, produtos);
    setLinhas(iniciais);
    setProximoId(iniciais.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { id: proximoId, colaboradorId: "", empreendimento: "", etapas: [] }]);
    setProximoId((n) => n + 1);
  }

  function removerLinha(id: number) {
    setLinhas((atual) => atual.filter((l) => l.id !== id));
  }

  function atualizarLinha(id: number, campo: "colaboradorId" | "empreendimento", valor: string) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function alternarEtapa(id: number, codigo: string) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.id !== id) return l;
        const marcada = l.etapas.includes(codigo);
        return { ...l, etapas: marcada ? l.etapas.filter((e) => e !== codigo) : [...l.etapas, codigo] };
      })
    );
  }

  function alternarTodasAsEtapas(id: number) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.id !== id) return l;
        const todasMarcadas = etapas.length > 0 && etapas.every((e) => l.etapas.includes(e.codigo));
        return { ...l, etapas: todasMarcadas ? [] : etapas.map((e) => e.codigo) };
      })
    );
  }

  function construirMatriz(): MatrizEmpreendimentos {
    const resultado: MatrizEmpreendimentos = {};
    for (const linha of linhas) {
      const chave = normalize(linha.empreendimento);
      const colaborador = selecionaveis.find((c) => c.uid === linha.colaboradorId);
      const quadro = colaborador && quadroDoColaborador(colaborador);
      if (!chave || !colaborador || !quadro || linha.etapas.length === 0) continue;
      const atribuicao: AtribuicaoEmpreendimento = {
        colaboradorId: colaborador.uid,
        colaboradorNome: colaborador.nome,
        quadro,
        etapas: linha.etapas,
      };
      resultado[chave] = [...(resultado[chave] ?? []), atribuicao];
    }
    return resultado;
  }

  async function salvar() {
    if (!firebaseUser) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarMapeamentoEmpreendimentos(construirMatriz(), firebaseUser.uid);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a matriz.");
    } finally {
      setSalvando(false);
    }
  }

  const alterado = JSON.stringify(construirMatriz()) !== JSON.stringify(overrides);

  return (
    <div className="surface-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-brand-primary" />
        <h2 className="text-sm font-bold text-ink-primary dark:text-white">Atribuição por Empreendimento e Etapa</h2>
      </div>
      <p className="text-xs text-ink-secondary dark:text-white/60">
        Vincule um colaborador a um empreendimento e marque as etapas pelas quais ele é responsável —
        empreendimentos e etapas vêm direto das pastas já importadas, sem cadastro manual. Tem prioridade sobre o
        roteamento por cidade só nas etapas marcadas; nas demais, a pasta continua caindo no roteamento padrão.
      </p>

      {!loading && produtos.length === 0 && (
        <p className="text-xs text-status-warning">
          Nenhum empreendimento encontrado ainda — importe ao menos uma planilha para poder montar vínculos.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {linhas.map((linha) => {
          const todasMarcadas = etapas.length > 0 && etapas.every((e) => linha.etapas.includes(e.codigo));
          return (
            <div key={linha.id} className="flex flex-col gap-2 rounded-md border border-ink-primary/10 p-3 dark:border-white/10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="input-field flex-1"
                  value={linha.empreendimento}
                  onChange={(e) => atualizarLinha(linha.id, "empreendimento", e.target.value)}
                >
                  <option value="">Selecione o empreendimento</option>
                  {produtos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  className="input-field sm:w-64"
                  value={linha.colaboradorId}
                  onChange={(e) => atualizarLinha(linha.id, "colaboradorId", e.target.value)}
                >
                  <option value="">Selecione o colaborador</option>
                  {selecionaveis.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => removerLinha(linha.id)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-status-danger transition-colors hover:bg-status-danger/10 self-start sm:self-auto"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-ink-secondary dark:text-white/60">Etapas sob responsabilidade</span>
                <button
                  type="button"
                  onClick={() => alternarTodasAsEtapas(linha.id)}
                  disabled={etapas.length === 0}
                  className="text-[11px] font-medium text-brand-primary hover:underline disabled:opacity-40"
                >
                  {todasMarcadas ? "Desmarcar todas as etapas" : "Marcar todas as etapas"}
                </button>
              </div>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md bg-ink-primary/[0.03] p-2 dark:bg-white/5">
                {etapas.length === 0 && <span className="text-xs text-ink-secondary dark:text-white/50">Nenhuma etapa disponível ainda.</span>}
                {etapas.map((etapa) => (
                  <label key={etapa.codigo} className="flex items-center gap-1.5 text-xs text-ink-primary dark:text-white/80">
                    <input
                      type="checkbox"
                      checked={linha.etapas.includes(etapa.codigo)}
                      onChange={() => alternarEtapa(linha.id, etapa.codigo)}
                      className="h-3.5 w-3.5"
                    />
                    {etapa.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={adicionarLinha} className="btn-secondary h-10 w-full justify-center sm:w-auto">
        <Plus size={16} />
        Adicionar vínculo
      </button>

      {erro && <p className="text-xs text-status-danger">{erro}</p>}

      <div className="flex items-center justify-end gap-3">
        {alterado && <span className="text-[11px] text-status-warning">Alterações não salvas</span>}
        <button type="button" className="btn-primary h-10" onClick={salvar} disabled={!alterado || salvando}>
          {salvando ? "Salvando…" : "Salvar Matriz"}
        </button>
      </div>
    </div>
  );
}
