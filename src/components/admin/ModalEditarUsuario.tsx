"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { superioresPossiveis, travaDoCargo } from "@/lib/auth/acoesUsuario";
import {
  CARGOS,
  PERMISSOES,
  ROTULO_LEGADO,
  calcularPermissoes,
  ehCargo,
  permissaoTravada,
  roleDoCargo,
  rotuloCompleto,
  rotuloDoPerfil,
  temPermissao,
  type PermissoesParciais,
} from "@/lib/auth/cargos";
import { ASSISTENTE_LABEL, ROLE_LABEL } from "@/lib/types";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";
import { mascaraCpf, mascaraTelefone } from "@/lib/utils/cadastro";
import { hojeISO } from "@/lib/utils/dates";
import type { Admin } from "./useAdmin";
import { Botao, Interruptor, PRACAS, Rotulo } from "./ui";

/** "Editar cadastro": dados, cargo + Superior Hierárquico (obrigatório) e permissões individuais. */
export function ModalEditarUsuario({
  usuario,
  todos,
  eu,
  admin,
  onFechar,
}: {
  usuario: UsuarioPainel;
  todos: UsuarioPainel[];
  eu: UserProfile;
  admin: Admin;
  onFechar: () => void;
}) {
  const proprio = usuario.uid === eu.uid;
  const [dados, setDados] = useState({
    nome: usuario.nome ?? "",
    telefone: usuario.telefone ?? "",
    cpf: usuario.cpf ?? "",
    dataNascimento: usuario.dataNascimento ?? "",
    imobiliaria: usuario.imobiliaria ?? "",
    creci: usuario.creci ?? "",
  });
  const [cargo, setCargo] = useState<string>(usuario.cargo ?? "");
  const [praca, setPraca] = useState<string>(usuario.praca ?? "");
  const [superiorId, setSuperiorId] = useState(usuario.superiorId ?? "");
  const [individuais, setIndividuais] = useState<PermissoesParciais>(usuario.permissoesIndividuais ?? {});
  const [mexeuPermissoes, setMexeuPermissoes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const roleFinal = ehCargo(cargo) ? roleDoCargo(cargo) : usuario.role;
  const permissoes = calcularPermissoes(
    { cargo: cargo || null, role: roleFinal, permissoesIndividuais: individuais },
    admin.permissoesPorCargo
  );
  const superiores = superioresPossiveis(usuario.uid, todos);
  const superiorForaDaLista = !!usuario.superiorId && !superiores.some((s) => s.uid === usuario.superiorId);
  const campo = (nome: keyof typeof dados, mascara?: (v: string) => string) => ({
    value: dados[nome],
    onChange: (e: { target: { value: string } }) =>
      setDados((d) => ({ ...d, [nome]: mascara ? mascara(e.target.value) : e.target.value })),
  });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!proprio && cargo !== "dono" && !superiorId) return setErro("Escolha o Superior Hierárquico.");
    if (roleFinal === "assistente" && !praca) return setErro("Escolha a praça (quadro de tarefas) deste assistente.");
    setSalvando(true);
    const falha = await admin.agir(
      usuario.uid,
      {
        tipo: "editar",
        dados,
        cargo: cargo || null,
        praca: roleFinal === "assistente" ? praca : null,
        superiorId: superiorId || null,
        ...(mexeuPermissoes ? { permissoesIndividuais: individuais } : {}),
      },
      false
    );
    setSalvando(false);
    if (falha) setErro(falha);
    else onFechar();
  }

  const doisPorLinha = "grid grid-cols-1 gap-3 sm:grid-cols-2";

  return (
    <Modal titulo={`Editar cadastro de ${usuario.nome}`} onClose={onFechar}>
      <p className="-mt-3 mb-4 break-all text-xs text-ink-muted">E-mail: {usuario.email} (login não editável por aqui)</p>
      <form onSubmit={salvar} noValidate className="flex flex-col gap-4">
        <label className="block">
          <Rotulo>Nome completo</Rotulo>
          <input className="input-field" {...campo("nome")} />
        </label>
        <div className={doisPorLinha}>
          <label className="block">
            <Rotulo>Data de Nascimento</Rotulo>
            <input type="date" max={hojeISO()} className="input-field" {...campo("dataNascimento")} />
          </label>
          <label className="block">
            <Rotulo>Telefone/WhatsApp</Rotulo>
            <input inputMode="numeric" className="input-field" {...campo("telefone", mascaraTelefone)} />
          </label>
          <label className="block">
            <Rotulo>CPF</Rotulo>
            <input inputMode="numeric" className="input-field" {...campo("cpf", mascaraCpf)} />
          </label>
          <label className="block">
            <Rotulo>CRECI (opcional)</Rotulo>
            <input className="input-field" {...campo("creci")} />
          </label>
          <label className="block sm:col-span-2">
            <Rotulo>Imobiliária/Equipe/Loja</Rotulo>
            <input className="input-field" {...campo("imobiliaria")} />
          </label>
        </div>

        <div className={`${doisPorLinha} border-t border-border pt-4 dark:border-white/10`}>
          <label className="block min-w-0">
            <Rotulo>Cargo</Rotulo>
            <select className="input-field" value={cargo} disabled={proprio} onChange={(e) => setCargo(e.target.value)}>
              {!usuario.cargo && <option value="">Manter legado ({rotuloDoPerfil(usuario)})</option>}
              {CARGOS.filter((c) => c.id === usuario.cargo || !travaDoCargo(eu, c.id)).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <Rotulo>Superior Hierárquico{!proprio && cargo !== "dono" ? " *" : ""}</Rotulo>
            <select
              className="input-field"
              value={cargo === "dono" ? "" : superiorId}
              disabled={proprio || cargo === "dono"}
              required={!proprio && cargo !== "dono"}
              onChange={(e) => setSuperiorId(e.target.value)}
            >
              <option value="">{cargo === "dono" ? "Topo da hierarquia" : "Selecione o superior"}</option>
              {superiorForaDaLista && (
                <option value={usuario.superiorId!}>
                  {usuario.superiorNome} — {usuario.superiorCargo}
                </option>
              )}
              {superiores.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.nome} — {rotuloCompleto(s)}
                </option>
              ))}
            </select>
          </label>
          {roleFinal === "assistente" && (
            <label className="block min-w-0">
              <Rotulo>Praça (quadro de tarefas) *</Rotulo>
              <select className="input-field" value={praca} disabled={proprio} onChange={(e) => setPraca(e.target.value)}>
                <option value="">Selecione a praça</option>
                {PRACAS.map((p) => (
                  <option key={p} value={p}>
                    {ASSISTENTE_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {proprio && <p className="text-[11px] text-ink-muted">Você não pode trocar o próprio cargo, superior ou permissões.</p>}
        {roleFinal && (
          <p className="text-[11px] text-ink-muted">
            Perfil operacional no portal: <b>{ROLE_LABEL[roleFinal]}</b>
            {usuario.role && usuario.role !== roleFinal
              ? ` (hoje: ${ROTULO_LEGADO[usuario.role]}). Isso muda os quadros e telas que a pessoa enxerga.`
              : "."}
          </p>
        )}

        <fieldset className="border-t border-border pt-4 dark:border-white/10" disabled={proprio}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="float-left text-xs font-bold uppercase tracking-wide text-ink-muted">Permissões individuais</legend>
            {!proprio && Object.keys(individuais).length > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-brand-primary hover:underline"
                onClick={() => {
                  setIndividuais({});
                  setMexeuPermissoes(true);
                }}
              >
                Usar o padrão do cargo
              </button>
            )}
          </div>
          <ul className="clear-both flex flex-col gap-2">
            {PERMISSOES.map((p) => {
              const travada = permissaoTravada(cargo, p.id);
              const semDireito = !permissoes[p.id] && !temPermissao(eu, p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 text-xs text-ink-primary dark:text-white">
                  <span>{p.nome}</span>
                  <Interruptor
                    rotulo={p.nome}
                    ligado={permissoes[p.id]}
                    desabilitado={proprio || travada || semDireito}
                    titulo={travada ? "Sempre liberado para este cargo" : semDireito ? "Você não tem essa permissão para liberar" : undefined}
                    onChange={(ligado) => {
                      setIndividuais((atual) => ({ ...atual, [p.id]: ligado }));
                      setMexeuPermissoes(true);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>

        {erro && <p className="rounded-md bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao type="submit" tom="verde" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar alterações"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
