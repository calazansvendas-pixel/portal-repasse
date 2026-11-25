// Superfiltros do Dossiê: transições de etapa derivadas do trajeto diário da pasta e o cruzamento
// "Etapa atual" x "Saiu da" x "Entrou na" x período. Módulo puro (servidor, tela e testes).
import { codigoEtapa } from "@/lib/auth/roles";
import type { EtapaHistorico } from "@/lib/types";
import type { PastaResumo } from "@/lib/utils/buscaClientes";

/** Uma mudança de etapa. `data` é a da planilha em que a mudança apareceu (yyyy-MM-dd). */
export interface Movimento {
  /** Código da etapa anterior; null = a pasta apareceu na base já nesta etapa. */
  de: string | null;
  para: string;
  data: string;
}

export interface PastaDossie extends PastaResumo {
  movimentos: Movimento[];
}

/**
 * O trajeto tem um passo por importação, mesmo sem mudança: só conta quando o CÓDIGO da etapa muda.
 * O primeiro passo vira uma entrada (sem etapa anterior), exceto se for da primeira planilha da
 * base — ali a pasta já existia e não se sabe quando entrou na etapa.
 */
export function extrairMovimentos(historico: EtapaHistorico[], primeiraPlanilha: string): Movimento[] {
  const movimentos: Movimento[] = [];
  let anterior: string | null = null;
  for (const passo of historico) {
    const codigo = codigoEtapa(passo.etapa ?? "");
    if (!codigo || codigo === anterior) continue;
    if (anterior !== null || passo.data > primeiraPlanilha) {
      movimentos.push({ de: anterior, para: codigo, data: passo.data });
    }
    anterior = codigo;
  }
  return movimentos;
}

export interface FiltrosMovimentacao {
  etapaAtual: string;
  saiu: string;
  entrou: string;
  de: string; // yyyy-MM-dd
  ate: string;
}

export const SEM_FILTROS: FiltrosMovimentacao = { etapaAtual: "", saiu: "", entrou: "", de: "", ate: "" };

export function temFiltro(f: FiltrosMovimentacao): boolean {
  return Object.values(f).some(Boolean);
}

export interface Correspondencia {
  /** Movimentação mostrada na lista (a que atendeu o filtro; sem filtro de movimento, a última). */
  descricao: string;
  data: string | null;
  /** Quantas outras movimentações da pasta também atenderam. */
  outras: number;
  /** Movimento que representa a pasta no funil: com "Saiu da", a saída; senão o mostrado na lista. */
  movimento: Movimento | null;
}

function descrever(m: Movimento): string {
  return m.de ? `${m.de} → ${m.para}` : `Nova na base → ${m.para}`;
}

function resultado(atendem: Movimento[], descricao?: string): Correspondencia {
  const ultima = atendem[atendem.length - 1];
  return {
    descricao: descricao ?? (ultima ? descrever(ultima) : "—"),
    data: ultima?.data ?? null,
    outras: Math.max(atendem.length - 1, 0),
    movimento: ultima ?? null,
  };
}

/** Todos os filtros preenchidos valem juntos (E). Devolve null se a pasta não atende. */
export function avaliarPasta(pasta: PastaDossie, f: FiltrosMovimentacao): Correspondencia | null {
  const { etapaAtual, saiu, entrou, de, ate } = f;
  if (etapaAtual && codigoEtapa(pasta.etapa ?? "") !== etapaAtual) return null;

  const movimentos = pasta.movimentos;
  const temPeriodo = !!de || !!ate;
  const noPeriodo = (m: Movimento) => (!de || m.data >= de) && (!ate || m.data <= ate);
  const saiuDe = (m: Movimento) => m.de === saiu && m.para !== saiu && noPeriodo(m);
  const entrouEm = (m: Movimento) => m.para === entrou && m.de !== entrou && noPeriodo(m);

  if (saiu && entrou) {
    // Sem período: a transição direta X → Y. Com período: saiu de X e depois (ou no mesmo salto)
    // entrou em Y, as duas movimentações dentro da janela.
    if (!temPeriodo) {
      const diretas = movimentos.filter((m) => saiuDe(m) && entrouEm(m));
      return diretas.length ? resultado(diretas) : null;
    }
    for (let j = movimentos.length - 1; j >= 0; j--) {
      if (!entrouEm(movimentos[j])) continue;
      for (let i = j; i >= 0; i--) {
        if (!saiuDe(movimentos[i])) continue;
        const descricao = i === j ? undefined : `${saiu} → … → ${entrou} (saiu em ${dataCurta(movimentos[i].data)})`;
        return { ...resultado([movimentos[j]], descricao), movimento: movimentos[i] };
      }
    }
    return null;
  }

  if (saiu || entrou) {
    const atendem = movimentos.filter(saiu ? saiuDe : entrouEm);
    return atendem.length ? resultado(atendem) : null;
  }

  if (temPeriodo) {
    // Com "Etapa atual": precisa ter entrado nela na janela. Só período: qualquer movimentação.
    const atendem = movimentos.filter((m) => noPeriodo(m) && (!etapaAtual || m.para === etapaAtual));
    return atendem.length ? resultado(atendem) : null;
  }

  // Só "Etapa atual": o que interessa é a movimentação que levou a pasta até ela.
  const ultima = movimentos.filter((m) => !etapaAtual || m.para === etapaAtual).pop();
  return resultado(ultima ? [ultima] : []);
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}
