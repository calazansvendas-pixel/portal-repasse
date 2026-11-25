"use client";

import { useState } from "react";
import { Check, Eye, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { travaDoAlvo, travaDoCargo } from "@/lib/auth/acoesUsuario";
import { CARGOS, nomeDoCargo, roleDoCargo, type CargoId } from "@/lib/auth/cargos";
import { ASSISTENTE_LABEL } from "@/lib/types";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import type { Admin } from "./useAdmin";
import { Botao, PRACAS, Rotulo } from "./ui";

interface Escolha {
  cargo: string;
  praca: string;
}

function SeletoresAprovacao({ eu, escolha, onChange }: { eu: UserProfile; escolha: Escolha; onChange: (e: Escolha) => void }) {
  const assistente = !!escolha.cargo && roleDoCargo(escolha.cargo as CargoId) === "assistente";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="block min-w-0">
        <Rotulo>Cargo indicado</Rotulo>
        <select className="input-field" value={escolha.cargo} onChange={(e) => onChange({ ...escolha, cargo: e.target.value })}>
          <option value="" disabled>
            Selecione o cargo
          </option>
          {CARGOS.filter((c) => !travaDoCargo(eu, c.id)).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      {assistente && (
        <label className="block min-w-0">
          <Rotulo>Praça (quadro de tarefas)</Rotulo>
          <select className="input-field" value={escolha.praca} onChange={(e) => onChange({ ...escolha, praca: e.target.value })}>
            <option value="" disabled>
              Selecione a praça
            </option>
            {PRACAS.map((p) => (
              <option key={p} value={p}>
                {ASSISTENTE_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Cadastros pendentes, com "Ver Cadastro", Aprovar e Recusar. */
export function Pendentes({ usuarios, todos, eu, admin }: { usuarios: UsuarioPainel[]; todos: UsuarioPainel[]; eu: UserProfile; admin: Admin }) {
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [verId, setVerId] = useState<string | null>(null);

  const escolhaDe = (u: UsuarioPainel): Escolha => {
    if (escolhas[u.uid]) return escolhas[u.uid];
    const cargo = u.cargoPretendido && !travaDoCargo(eu, u.cargoPretendido) ? u.cargoPretendido : "";
    return { cargo, praca: "" };
  };
  const escolher = (uid: string, e: Escolha) => setEscolhas((atual) => ({ ...atual, [uid]: e }));
  const podeAprovar = (e: Escolha) => !!e.cargo && (roleDoCargo(e.cargo as CargoId) !== "assistente" || !!e.praca);
  const aprovar = (u: UsuarioPainel) => {
    const e = escolhaDe(u);
    return admin.agir(u.uid, { tipo: "aprovar", cargo: e.cargo, praca: e.praca || null });
  };

  const vendo = usuarios.find((u) => u.uid === verId);

  const acoes = (u: UsuarioPainel) => {
    const trava = travaDoAlvo(eu, u, todos);
    const ocupado = admin.ocupado === u.uid;
    return (
      <>
        <Botao
          tom="verde"
          disabled={ocupado || !!trava || !podeAprovar(escolhaDe(u))}
          title={trava ?? (podeAprovar(escolhaDe(u)) ? "Aprovar cadastro" : "Escolha o cargo (e a praça, se for assistente)")}
          onClick={() => aprovar(u)}
        >
          <Check size={14} /> Aprovar
        </Botao>
        <Botao disabled={ocupado || !!trava} title={trava ?? "Recusar cadastro"} onClick={() => admin.agir(u.uid, { tipo: "recusar" })}>
          <X size={14} /> Recusar
        </Botao>
      </>
    );
  };

  return (
    <>
      <ul className="divide-y divide-border text-xs dark:divide-white/10">
        {usuarios.map((u) => (
          <li key={u.uid} className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink-primary dark:text-white">{u.nome}</p>
              <p className="truncate text-ink-muted">{u.email}</p>
              <p className="truncate text-[11px] text-ink-secondary dark:text-white/60">
                {[u.imobiliaria, u.telefone, `Pretende: ${nomeDoCargo(u.cargoPretendido) ?? "—"}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <SeletoresAprovacao eu={eu} escolha={escolhaDe(u)} onChange={(e) => escolher(u.uid, e)} />
            <div className="flex flex-wrap gap-1.5">
              <Botao onClick={() => setVerId(u.uid)}>
                <Eye size={14} /> Ver Cadastro
              </Botao>
              {acoes(u)}
            </div>
          </li>
        ))}
      </ul>

      {vendo && (
        <Modal titulo={vendo.nome} onClose={() => setVerId(null)}>
          <p className="-mt-3 mb-4 text-xs text-ink-muted">Cadastro aguardando aprovação</p>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {[
              ["Nome completo", vendo.nome],
              ["E-mail", vendo.email],
              ["Data de nascimento", vendo.dataNascimento ? formatDateBR(vendo.dataNascimento) : "—"],
              ["Telefone / WhatsApp", vendo.telefone],
              ["Imobiliária / Equipe / Loja", vendo.imobiliaria],
              ["CPF", vendo.cpf],
              ["CRECI", vendo.creci],
              ["Cargo pretendido", nomeDoCargo(vendo.cargoPretendido)],
              ["Solicitado em", vendo.criadoEm ? formatDateTimeBR(vendo.criadoEm) : "—"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string} className="min-w-0 rounded-md border border-border bg-surface-soft p-2.5 dark:border-white/10 dark:bg-white/5">
                <dt className="text-[10px] font-bold uppercase text-ink-muted">{rotulo}</dt>
                <dd className="break-words font-semibold text-ink-primary dark:text-white">{valor || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t border-border pt-4 dark:border-white/10">
            <SeletoresAprovacao eu={eu} escolha={escolhaDe(vendo)} onChange={(e) => escolher(vendo.uid, e)} />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Botao onClick={() => setVerId(null)}>Fechar</Botao>
            {acoes(vendo)}
          </div>
        </Modal>
      )}
    </>
  );
}
