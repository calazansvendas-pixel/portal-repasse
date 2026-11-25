"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Botao, Rotulo } from "@/components/admin/ui";
import { criarId, lerPracas } from "@/lib/organograma/validacao";
import type { Praca } from "@/lib/organograma/tipos";

export function EditorPracas({ pracas, onSalvar, onFechar }: { pracas: Praca[]; onSalvar: (pracas: Praca[]) => Promise<string | null>; onFechar: () => void }) {
  const [linhas, setLinhas] = useState(() => pracas.map((p) => ({ ...p, busca: p.termos.join(", ") })));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = (i: number, campos: Partial<(typeof linhas)[number]>) => setLinhas((a) => a.map((l, j) => (j === i ? { ...l, ...campos } : l)));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const final = lerPracas(
      linhas.map(({ id, nome, busca }) => ({
        id,
        nome,
        // Sem termo informado, a própria cidade é o termo de busca.
        termos: (busca.trim() || nome).split(",").map((t) => t.trim()).filter(Boolean),
      }))
    );
    if (typeof final === "string") return setErro(final);
    setSalvando(true);
    const falha = await onSalvar(final);
    setSalvando(false);
    if (falha) setErro(falha);
    else onFechar();
  }

  return (
    <Modal titulo="Praças e cidades" onClose={onFechar} largo>
      <form onSubmit={salvar} noValidate className="flex flex-col gap-3">
        <p className="text-xs text-ink-muted">
          Cada pasta entra na praça cujo termo aparece no empreendimento ou, depois, na cidade da planilha. A ordem da lista desempata.
        </p>
        {linhas.map((l, i) => (
          <div key={l.id} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3 dark:border-white/10">
            <label className="block min-w-0 flex-1 basis-40">
              <Rotulo>Nome</Rotulo>
              <input className="input-field !h-10" value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} />
            </label>
            <label className="block min-w-0 flex-[2] basis-56">
              <Rotulo>Termos de busca (vírgula)</Rotulo>
              <input className="input-field !h-10" placeholder={l.nome} value={l.busca} onChange={(e) => mudar(i, { busca: e.target.value })} />
            </label>
            <Botao aria-label={`Remover ${l.nome}`} onClick={() => setLinhas((a) => a.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </Botao>
          </div>
        ))}
        <Botao
          tom="editar"
          className="self-start"
          onClick={() => setLinhas((a) => [...a, { id: `${criarId("praca", a.map((l) => l.id))}_${Date.now().toString(36)}`, nome: "", termos: [], busca: "" }])}
        >
          <Plus size={14} /> Nova Praça/Cidade
        </Botao>
        {erro && <p className="rounded-md bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" tom="verde" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar praças"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
