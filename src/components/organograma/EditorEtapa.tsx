"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Botao, Rotulo } from "@/components/admin/ui";
import { criarId, lerEtapa } from "@/lib/organograma/validacao";
import { BLOCOS, type EtapaOrganograma, type ItemChecklist, type Modalidade, type Papel, type Praca, type TipoItem } from "@/lib/organograma/tipos";

/** Edição ao vivo de uma etapa: responsáveis por praça, prazo, descrição e checklist. */
export function EditorEtapa({
  etapa,
  pracas,
  nomes,
  onSalvar,
  onFechar,
}: {
  etapa: EtapaOrganograma;
  pracas: Praca[];
  /** Sugestões para os campos de responsável (aceitam qualquer nome). */
  nomes: string[];
  onSalvar: (etapa: EtapaOrganograma) => Promise<string | null>;
  onFechar: () => void;
}) {
  const [r, setR] = useState<EtapaOrganograma>(etapa);
  const [prazo, setPrazo] = useState(etapa.slaDias?.toString() ?? "");
  const [selos, setSelos] = useState(etapa.selos.join(", "));
  const [modalidadeId, setModalidadeId] = useState(etapa.modalidades[0]?.id ?? "");
  const [novaModalidade, setNovaModalidade] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = (campos: Partial<EtapaOrganograma>) => setR((a) => ({ ...a, ...campos }));
  const mudarPapel = (id: string, campos: Partial<Papel>) => setR((a) => ({ ...a, papeis: a.papeis.map((p) => (p.id === id ? { ...p, ...campos } : p)) }));
  const modalidade = r.modalidades.find((m) => m.id === modalidadeId) ?? r.modalidades[0];
  const mudarModalidade = (campos: Partial<Modalidade>) =>
    modalidade && setR((a) => ({ ...a, modalidades: a.modalidades.map((m) => (m.id === modalidade.id ? { ...m, ...campos } : m)) }));
  const mudarItem = (id: string, campos: Partial<ItemChecklist>) =>
    modalidade && mudarModalidade({ itens: modalidade.itens.map((i) => (i.id === id ? { ...i, ...campos } : i)) });

  function criarModalidade() {
    const nome = novaModalidade?.trim();
    if (!nome) return;
    const id = criarId(nome, r.modalidades.map((m) => m.id));
    // Nasce como cópia da modalidade aberta: criar CLT, MEI etc. vira só ajustar a lista.
    mudar({ modalidades: [...r.modalidades, { id, nome, itens: modalidade ? modalidade.itens.map((i) => ({ ...i })) : [] }] });
    setModalidadeId(id);
    setNovaModalidade(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const final = lerEtapa({
      ...r,
      slaDias: prazo.trim() ? Number(prazo) : null,
      selos: selos.split(","),
      modalidades: r.modalidades.map((m) => ({ ...m, itens: m.itens.filter((i) => i.texto.trim()) })),
    });
    if (typeof final === "string") return setErro(final);
    setSalvando(true);
    const falha = await onSalvar(final);
    setSalvando(false);
    if (falha) setErro(falha);
    else onFechar();
  }

  const secao = "flex flex-col gap-3 border-t border-border pt-4 dark:border-white/10";
  const tituloSecao = "text-xs font-bold uppercase tracking-wide text-ink-muted";
  const chave = (rotulo: string, ligado: boolean, onChange: (v: boolean) => void) => (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-primary dark:text-white">
      <input type="checkbox" className="h-4 w-4 accent-brand-primary" checked={ligado} onChange={(e) => onChange(e.target.checked)} />
      {rotulo}
    </label>
  );

  return (
    <Modal titulo={`Editar etapa ${etapa.codigo}`} onClose={onFechar} largo>
      <form onSubmit={salvar} noValidate className="flex flex-col gap-4">
        <datalist id="nomes-organograma">
          {nomes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <Rotulo>Nome da etapa</Rotulo>
            <input className="input-field" value={r.nome} onChange={(e) => mudar({ nome: e.target.value })} />
          </label>
          <label className="block">
            <Rotulo>Bloco do funil</Rotulo>
            <select className="input-field" value={r.bloco} onChange={(e) => mudar({ bloco: Number(e.target.value) })}>
              {Object.entries(BLOCOS).map(([n, nome]) => (
                <option key={n} value={n}>
                  {n} — {nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <Rotulo>Descrição da função</Rotulo>
            <textarea className="input-field !h-auto py-2" rows={3} value={r.funcao} onChange={(e) => mudar({ funcao: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <Rotulo>Fluxo esperado</Rotulo>
            <input className="input-field" value={r.fluxoEsperado} onChange={(e) => mudar({ fluxoEsperado: e.target.value })} />
          </label>
          <label className="block">
            <Rotulo>Prazo (SLA) em dias corridos</Rotulo>
            <input type="number" min={1} max={365} inputMode="numeric" className="input-field" placeholder="Sem prazo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </label>
          <label className="block">
            <Rotulo>Selos (separados por vírgula)</Rotulo>
            <input className="input-field" value={selos} onChange={(e) => setSelos(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {chave("Destacar como atenção", r.alerta, (alerta) => mudar({ alerta }))}
          {chave("Alertar na entrada até concluir o checklist", r.conferirNaEntrada, (conferirNaEntrada) => mudar({ conferirNaEntrada }))}
          {chave('Permitir "Casal / 2º Proponente"', r.permiteCasal, (permiteCasal) => mudar({ permiteCasal }))}
        </div>

        <section className={secao}>
          <h3 className={tituloSecao}>Responsáveis</h3>
          {r.papeis.map((p) => (
            <fieldset key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 dark:border-white/10">
              <div className="flex items-end gap-2">
                <label className="block min-w-0 flex-1">
                  <Rotulo>Papel</Rotulo>
                  <input className="input-field !h-10" value={p.rotulo} onChange={(e) => mudarPapel(p.id, { rotulo: e.target.value })} />
                </label>
                <Botao aria-label={`Remover o papel ${p.rotulo}`} onClick={() => mudar({ papeis: r.papeis.filter((x) => x.id !== p.id) })}>
                  <Trash2 size={14} />
                </Botao>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <Rotulo>Todas as praças</Rotulo>
                  <input list="nomes-organograma" data-responsavel={`${p.id}:todas`} className="input-field !h-10" value={p.todas} onChange={(e) => mudarPapel(p.id, { todas: e.target.value })} />
                </label>
                {pracas.map((praca) => (
                  <label key={praca.id} className="block">
                    <Rotulo>{praca.nome}</Rotulo>
                    <input
                      list="nomes-organograma"
                      data-responsavel={`${p.id}:${praca.id}`}
                      className="input-field !h-10"
                      placeholder={p.todas || "Sem responsável"}
                      value={p.porPraca[praca.id] ?? ""}
                      onChange={(e) => mudarPapel(p.id, { porPraca: { ...p.porPraca, [praca.id]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Botao tom="editar" onClick={() => mudar({ papeis: [...r.papeis, { id: criarId("papel", r.papeis.map((p) => p.id)), rotulo: "Novo papel", todas: "", porPraca: {} }] })}>
              <Plus size={14} /> Novo papel
            </Botao>
            <label className="block w-full sm:w-64">
              <Rotulo>Quem é acionado ao estourar o prazo</Rotulo>
              <select className="input-field !h-10" value={r.papelEscalonamento ?? ""} onChange={(e) => mudar({ papelEscalonamento: e.target.value || null })}>
                <option value="">Ninguém</option>
                {r.papeis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={secao}>
          <h3 className={tituloSecao}>Checklist</h3>
          <div className="flex flex-wrap items-end gap-2">
            {modalidade && (
              <>
                <label className="block min-w-0 flex-1 basis-40">
                  <Rotulo>Modalidade</Rotulo>
                  <select className="input-field !h-10" value={modalidade.id} onChange={(e) => setModalidadeId(e.target.value)}>
                    {r.modalidades.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0 flex-1 basis-40">
                  <Rotulo>Nome da modalidade</Rotulo>
                  <input className="input-field !h-10" value={modalidade.nome} onChange={(e) => mudarModalidade({ nome: e.target.value })} />
                </label>
                <Botao aria-label={`Remover a modalidade ${modalidade.nome}`} onClick={() => mudar({ modalidades: r.modalidades.filter((m) => m.id !== modalidade.id) })}>
                  <Trash2 size={14} />
                </Botao>
              </>
            )}
          </div>
          {novaModalidade === null ? (
            <Botao tom="editar" className="self-start" onClick={() => setNovaModalidade("")}>
              <Plus size={14} /> Nova Modalidade de Cliente
            </Botao>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                className="input-field !h-10 min-w-0 flex-1"
                placeholder="Ex.: CLT, MEI, Empresário"
                value={novaModalidade}
                onChange={(e) => setNovaModalidade(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    criarModalidade();
                  }
                }}
              />
              <Botao tom="verde" disabled={!novaModalidade.trim()} onClick={criarModalidade}>
                Criar
              </Botao>
              <Botao onClick={() => setNovaModalidade(null)}>Cancelar</Botao>
            </div>
          )}
          {modalidade && (
            <>
              <ul className="flex flex-col gap-2">
                {modalidade.itens.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 dark:border-white/10">
                    <input aria-label="Texto do item" className="input-field !h-10 min-w-0 flex-1 basis-60" value={i.texto} onChange={(e) => mudarItem(i.id, { texto: e.target.value })} />
                    <select aria-label="Tipo do item" className="input-field !h-10 !w-auto" value={i.tipo} onChange={(e) => mudarItem(i.id, { tipo: e.target.value as TipoItem })}>
                      <option value="marca">Marcar</option>
                      <option value="opcoes">Escolher opção</option>
                      <option value="texto">Texto livre</option>
                    </select>
                    {r.permiteCasal && chave("Repete para o 2º proponente", !!i.porProponente, (porProponente) => mudarItem(i.id, { porProponente }))}
                    <Botao aria-label={`Remover o item ${i.texto}`} onClick={() => mudarModalidade({ itens: modalidade.itens.filter((x) => x.id !== i.id) })}>
                      <Trash2 size={14} />
                    </Botao>
                    {i.tipo === "opcoes" && (
                      <input
                        aria-label="Opções"
                        className="input-field !h-10 basis-full"
                        placeholder="Opções separadas por vírgula"
                        value={(i.opcoes ?? []).join(",")}
                        onChange={(e) => mudarItem(i.id, { opcoes: e.target.value.split(",") })}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <Botao
                tom="editar"
                className="self-start"
                onClick={() => mudarModalidade({ itens: [...modalidade.itens, { id: criarId("item", modalidade.itens.map((i) => i.id)) + `_${Date.now().toString(36)}`, texto: "", tipo: "marca" }] })}
              >
                <Plus size={14} /> Novo item
              </Botao>
            </>
          )}
        </section>

        {erro && <p className="rounded-md bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{erro}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {etapa.atualizadoPorNome && <p className="mr-auto text-[11px] text-ink-muted">Última edição: {etapa.atualizadoPorNome}</p>}
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" tom="verde" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar etapa"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
