export interface SnapshotEtapa {
  numero: string;
  importacaoId: string; // yyyy-MM-dd
  etapa: string;
}

export interface EvolucaoEtapas {
  datas: string[];
  etapas: string[];
  // um ponto por data, com uma chave por etapa (dias médios de permanência) + "data"
  pontos: Array<Record<string, string | number | null>>;
  // tempo médio de permanência na etapa, na última data disponível (para o gráfico de gargalos)
  gargalos: { etapa: string; diasMedios: number }[];
}

const MAX_ETAPAS = 8;

/**
 * A partir dos snapshots diários (coleção registros/{numero}/snapshots), calcula
 * quantos dias consecutivos cada pasta permaneceu na mesma etapa em cada
 * importação, e tira a média por etapa/dia. Isso alimenta tanto o gráfico de
 * "Evolução Diária" (série temporal) quanto o de "Gargalos" (foto do dia mais recente).
 */
export function calcularEvolucaoEtapas(entradas: SnapshotEtapa[]): EvolucaoEtapas {
  const porNumero = new Map<string, SnapshotEtapa[]>();
  for (const e of entradas) {
    const lista = porNumero.get(e.numero) ?? [];
    lista.push(e);
    porNumero.set(e.numero, lista);
  }

  // (importacaoId -> etapa -> lista de "dias na etapa")
  const dwellPorDataEtapa = new Map<string, Map<string, number[]>>();
  const frequenciaEtapa = new Map<string, number>();

  for (const historico of porNumero.values()) {
    historico.sort((a, b) => a.importacaoId.localeCompare(b.importacaoId));
    let etapaAnterior: string | null = null;
    let dias = 0;

    for (const ponto of historico) {
      dias = ponto.etapa === etapaAnterior ? dias + 1 : 1;
      etapaAnterior = ponto.etapa;

      if (!dwellPorDataEtapa.has(ponto.importacaoId)) dwellPorDataEtapa.set(ponto.importacaoId, new Map());
      const porEtapa = dwellPorDataEtapa.get(ponto.importacaoId)!;
      porEtapa.set(ponto.etapa, [...(porEtapa.get(ponto.etapa) ?? []), dias]);

      frequenciaEtapa.set(ponto.etapa, (frequenciaEtapa.get(ponto.etapa) ?? 0) + 1);
    }
  }

  const datas = [...dwellPorDataEtapa.keys()].sort();
  const etapas = [...frequenciaEtapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ETAPAS)
    .map(([etapa]) => etapa)
    .sort();

  const pontos = datas.map((data) => {
    const porEtapa = dwellPorDataEtapa.get(data)!;
    const ponto: Record<string, string | number | null> = { data };
    for (const etapa of etapas) {
      const valores = porEtapa.get(etapa);
      ponto[etapa] = valores?.length ? media(valores) : null;
    }
    return ponto;
  });

  const ultimaData = datas[datas.length - 1];
  const gargalos = ultimaData
    ? etapas
        .map((etapa) => ({ etapa, diasMedios: (pontos[pontos.length - 1][etapa] as number | null) ?? 0 }))
        .filter((g) => g.diasMedios > 0)
        .sort((a, b) => b.diasMedios - a.diasMedios)
    : [];

  return { datas, etapas, pontos, gargalos };
}

function media(valores: number[]): number {
  return Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
}
