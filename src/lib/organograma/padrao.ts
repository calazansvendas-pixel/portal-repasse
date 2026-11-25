// Pré-carga do Organograma com a operação real. Vale até a primeira edição na tela; depois disso
// quem manda é o que está salvo no Firestore (a pré-carga nunca sobrescreve).
import type { EtapaOrganograma, ItemChecklist, Modalidade, Papel, Praca } from "./tipos";

export const PRACAS_PADRAO: Praca[] = [
  { id: "morada_vitoria", nome: "Morada Vitória", termos: ["morada vitoria", "morada de vitoria"] },
  { id: "serra", nome: "Serra", termos: ["serra"] },
  { id: "vila_velha", nome: "Vila Velha", termos: ["vila velha"] },
  { id: "jardim_camburi", nome: "Jardim Camburi", termos: ["camburi", "fatima"] },
];

const papel = (id: string, rotulo: string, todas = "", porPraca: Record<string, string> = {}): Papel => ({ id, rotulo, todas, porPraca });
/** Serra, Vila Velha e Morada Vitória, o recorte mais comum. */
const tres = (serra: string, vilaVelha: string, moradaVitoria: string) => ({ serra, vila_velha: vilaVelha, morada_vitoria: moradaVitoria });

const marca = (id: string, texto: string, porProponente = false): ItemChecklist => ({ id, texto, tipo: "marca", ...(porProponente ? { porProponente } : {}) });
const diagnostico = (itens: ItemChecklist[]): Modalidade[] => [{ id: "diagnostico", nome: "Diagnóstico", itens }];

const DOCUMENTACAO_BASICA: Modalidade = {
  id: "basica",
  nome: "Documentação Básica",
  itens: [
    marca("ficha_morar", "Ficha da Morar (não precisa de assinatura)", true),
    marca("autorizacao_pesquisa", "Ficha de Autorização para Pesquisa Cadastral (assinada — idealmente via Autentique)", true),
    marca("identificacao", "Documento de Identificação (RG/CNH)", true),
    marca("estado_civil", "Certidão de Estado Civil"),
    marca("residencia", "Comprovante de Residência"),
    marca("renda", "Comprovante de Renda", true),
    marca("carteira", "Carteira de Trabalho", true),
    marca("fgts", "Extrato de FGTS", true),
  ],
};

function etapa(codigo: string, bloco: number, nome: string, extra: Partial<EtapaOrganograma>): EtapaOrganograma {
  return {
    codigo,
    bloco,
    nome,
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
    ...extra,
  };
}

const correspondente = (codigo: string, nome: string, funcao: string, fluxoEsperado: string) =>
  etapa(codigo, 2, nome, {
    funcao,
    fluxoEsperado,
    papeis: [papel("executor", "Executor", "Correspondente CAIXA"), papel("monitor", "Monitoramento de SLA interno", "", tres("Andressa", "Andressa", "Catarina"))],
  });

const contrato = (codigo: string, nome: string, funcao: string, extra: Partial<EtapaOrganograma> = {}) =>
  etapa(codigo, 7, nome, {
    funcao,
    papeis: [
      codigo === "5.05" || codigo === "5.06"
        ? papel("boleto", "Boleto / Sinal", "Laiza")
        : papel("assinatura", "Assinatura / Pendências", "", tres("Andressa", "Andressa", "Catarina")),
      papel("destrave", "Destrave externo", "Paulo"),
    ],
    ...extra,
  });

const CONFERENCIA_FINAL = [papel("conferencia", "Conferência final", "Andressa / Catarina"), papel("arquivo", "Apoio arquivo físico / loja", "Eliane")];

export const ETAPAS_PADRAO: EtapaOrganograma[] = [
  etapa("0.01", 1, "Inclusão da Pasta", {
    funcao: "Conferir o checklist de documentos, cobrar o corretor do que falta ou avisar que já pode virar para 0.99.",
    fluxoEsperado: "0.01 → 0.99 (o corretor movimenta; Eliane só vira se o corretor solicitar).",
    slaDias: 5,
    papeis: [papel("nivel1", "Nível 1 (Dia 0)", "Eliane"), papel("nivel2", "Nível 2 (escalonamento por SLA)", "Andressa")],
    papelEscalonamento: "nivel2",
    permiteCasal: true,
    modalidades: [DOCUMENTACAO_BASICA],
  }),

  correspondente("0.99", "Triagem Inicial", "Triagem da pasta pelo correspondente.", "0.99 → 2.01"),
  correspondente("2.01", "Fila de Análise", "Pasta aguardando análise do correspondente.", "2.01 → 2.03"),
  correspondente("2.03", "Pasta em Análise", "Análise de crédito pelo correspondente.", "2.03 → 2.05 ou pendências. Nunca vai direto do correspondente para 3.10."),

  etapa("0.04", 3, "Pendência / Restrição Cadastral", {
    funcao: "Diagnosticar a restrição e conduzir a regularização.",
    papeis: [papel("responsavel", "Responsável", "", tres("Andressa", "Andressa", "Catarina"))],
    modalidades: diagnostico([
      marca("restricao_interna", "Restrição interna CAIXA / CONRES / SERASA"),
      marca("bacen", "BACEN / SCR"),
      marca("cpf_receita", "CPF / Receita Federal"),
      marca("fgts_pis", "FGTS / PIS"),
      marca("renda_score", "Comprometimento de renda / Score"),
      marca("restricao_segundo", "Restrição do 2º proponente"),
      marca("doc_bancaria", "Documentação complementar bancária"),
    ]),
  }),
  etapa("0.07", 3, "Documentação Pendente", {
    funcao: "Identificar e cobrar os documentos que faltam.",
    papeis: [papel("responsavel", "Responsável", "Eliane"), papel("apoio", "Apoio", "", tres("Andressa", "Andressa", "Catarina"))],
    modalidades: diagnostico([
      marca("lista_pendencias", "Documentos pendentes identificados"),
      marca("corretor_cobrado", "Corretor cobrado"),
      marca("recebidos", "Documentos recebidos e conferidos"),
      { id: "observacao", texto: "Quais documentos faltam", tipo: "texto" },
    ]),
  }),
  etapa("0.80", 3, "Pasta em Tratamento Comercial", {
    funcao: "Tratar a pasta junto ao comercial.",
    papeis: [
      papel("responsavel", "Responsável", "", {
        serra: "Catarina / Andressa",
        vila_velha: "Andressa",
        morada_vitoria: "Catarina",
        jardim_camburi: "Catarina",
      }),
      papel("escalonamento", "Escalonamento", "Paulo"),
    ],
    papelEscalonamento: "escalonamento",
    modalidades: diagnostico([
      marca("motivo", "Motivo do tratamento identificado"),
      marca("corretor_contatado", "Corretor / imobiliária contatado"),
      marca("proximo_passo", "Próximo passo combinado"),
      { id: "observacao", texto: "Situação atual", tipo: "texto" },
    ]),
  }),
  etapa("1.17", 3, "Em Análise / Validação Correspondente", {
    funcao: "Acompanhar a validação junto ao correspondente.",
    papeis: [papel("responsavel", "Responsável", "", tres("Andressa", "Andressa", "Catarina"))],
    modalidades: diagnostico([marca("pendencia_apontada", "Pendência apontada pelo correspondente conferida"), marca("retorno", "Retorno enviado ao correspondente")]),
  }),

  etapa("2.05", 4, "Crédito Aprovado", {
    funcao: "Conferir a aprovação, comunicar o corretor, enviar a simulação da unidade desejada e apoiar o lançamento no VIMOB.",
    papeis: [papel("responsavel", "Responsável", "", { serra: "Laiza", vila_velha: "Catarina" })],
    modalidades: diagnostico([
      { id: "amortizacao", texto: "Sistema de amortização", tipo: "opcoes", opcoes: ["SAC", "PRICE"] },
      { id: "faixa", texto: "Faixa", tipo: "opcoes", opcoes: ["Faixa 2", "Faixa 3", "Faixa 4", "SBPE"] },
      { id: "valores", texto: "Valores aprovados", tipo: "texto" },
      marca("corretor_comunicado", "Corretor comunicado"),
      marca("simulacao", "Simulação da unidade desejada enviada"),
      marca("vimob", "Lançamento no VIMOB apoiado"),
    ]),
  }),
  etapa("2.051", 4, "Tratativas Morada Vitória", {
    funcao: "Conduzir as tratativas exclusivas do Morada Vitória.",
    papeis: [papel("responsavel", "Responsável", "Catarina")],
    selos: ["Exclusiva Morada Vitória"],
    modalidades: diagnostico([marca("tratativa", "Tratativa em andamento registrada"), marca("corretor", "Corretor atualizado"), { id: "observacao", texto: "Situação atual", tipo: "texto" }]),
  }),

  etapa("3.07", 5, "Proposta Lançada no VIMOB", {
    funcao: "Conferir os proponentes, refazer a simulação dentro da regra comercial e ligar para o corretor confirmando as datas antes do pente-fino do Crédito da Morar.",
    papeis: [papel("responsavel", "Responsável", "", tres("Laiza", "Laiza", "Catarina")), papel("apoio", "Apoio VIMOB", "Eliane / Paulo")],
    conferirNaEntrada: true,
    selos: ["Alerta na entrada"],
    modalidades: diagnostico([
      marca("proponentes", "Proponentes conferidos"),
      marca("simulacao", "Simulação refeita dentro da regra comercial"),
      marca("datas", "Datas confirmadas por telefone com o corretor"),
    ]),
  }),

  ...[
    ["3.10", "MCMV — Crédito Aprovado"],
    ["3.11", "Validação Interna"],
  ].map(([codigo, nome]) =>
    etapa(codigo, 6, nome, {
      funcao: "Validação do Crédito da Morar.",
      papeis: [papel("responsavel", "Responsável", "", tres("Laiza / Andressa", "Catarina", "Catarina"))],
    })
  ),

  contrato("5.03", "Emissão de Contrato", "Acompanhar a emissão e a assinatura do contrato."),
  contrato("5.04", "Contrato com Pendência Documental", "Resolver a pendência documental do contrato.", { alerta: true, selos: ["Pendência documental"] }),
  contrato("5.05", "Emissão de Boleto do Sinal", "Emitir o boleto do sinal."),
  contrato("5.06", "Aguardando Pagamento do Sinal", "Acompanhar o pagamento do sinal."),
  contrato("5.07", "Contrato Emitido sem Sinal", "Acompanhar o contrato liberado sem sinal.", { alerta: true, selos: ["Sem sinal"] }),

  etapa("9.09", 8, "Processo Finalizado", { funcao: "Conferência final e arquivo.", papeis: CONFERENCIA_FINAL }),
  etapa("3.99", 8, "Canceladas / Perdas", { funcao: "Conferência final das canceladas e arquivo.", papeis: CONFERENCIA_FINAL }),
];
