"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { codigoEtapa } from "@/lib/auth/roles";
import { filtrarClientes, type ClienteDossie } from "@/lib/utils/buscaClientes";
import { formatarCpfCnpj } from "@/lib/utils/cpf";
import { cn } from "@/lib/utils/cn";

function detalhes(c: ClienteDossie): string {
  return [
    c.cpfCnpj ? formatarCpfCnpj(c.cpfCnpj) : "CPF não informado",
    c.produto || null,
    c.etapa ? `Etapa ${codigoEtapa(c.etapa)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Campo "Nome ou CPF/CNPJ" pesquisável: abre a lista ao focar/clicar, filtra enquanto se digita e
 * entrega o cliente escolhido num clique (ou setas + Enter). Sem opção destacada, o Enter segue
 * para o formulário (botão "Buscar").
 */
export function ComboboxClientes({
  clientes,
  carregando,
  erro,
  texto,
  onTexto,
  onEscolher,
  onLimpar,
  onAbrir,
}: {
  clientes: ClienteDossie[];
  carregando: boolean;
  erro: string | null;
  texto: string;
  onTexto: (texto: string) => void;
  onEscolher: (cliente: ClienteDossie) => void;
  onLimpar: () => void;
  /** Chamado quando a lista abre (para recarregar depois de uma falha). */
  onAbrir?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  // Depois de escolher um cliente o campo mostra o nome dele, mas reabrir lista todos de novo.
  const [filtrando, setFiltrando] = useState(true);
  const raiz = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  const opcoes = useMemo(() => filtrarClientes(clientes, filtrando ? texto : ""), [clientes, filtrando, texto]);

  function abrir() {
    if (aberto) return;
    setAberto(true);
    setAtivo(-1);
    onAbrir?.();
  }

  function escolher(cliente: ClienteDossie) {
    onTexto(cliente.clienteNome);
    setFiltrando(false);
    setAberto(false);
    setAtivo(-1);
    onEscolher(cliente);
  }

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  // Mantém a opção destacada visível ao navegar com as setas.
  useEffect(() => {
    if (aberto && ativo >= 0) lista.current?.children[ativo]?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo]);

  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!aberto) return abrir();
      if (!opcoes.length) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setAtivo((i) => (i < 0 ? (passo > 0 ? 0 : opcoes.length - 1) : (i + passo + opcoes.length) % opcoes.length));
    } else if (e.key === "Enter") {
      if (aberto && opcoes[ativo]) {
        e.preventDefault();
        escolher(opcoes[ativo]);
      } else {
        setAberto(false);
      }
    } else if (e.key === "Escape") {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
      }
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  return (
    <div ref={raiz} className="relative">
      <Search size={16} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={aberto && ativo >= 0 ? `${id}-${ativo}` : undefined}
        aria-label="Nome ou CPF/CNPJ"
        autoComplete="off"
        className="input-field pl-9 pr-20"
        placeholder="Clique para escolher ou digite nome ou CPF/CNPJ"
        value={texto}
        onFocus={abrir}
        onClick={abrir}
        onKeyDown={teclado}
        onChange={(e) => {
          onTexto(e.target.value);
          setFiltrando(true);
          setAberto(true);
          // Digitando, o primeiro resultado já fica destacado para o Enter.
          setAtivo(e.target.value.trim() ? 0 : -1);
        }}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {texto && (
          <button
            type="button"
            aria-label="Limpar campo"
            title="Limpar"
            className="rounded-md p-1.5 text-ink-muted hover:text-ink-primary dark:hover:text-white"
            onClick={() => {
              onTexto("");
              setFiltrando(true);
              setAtivo(-1);
              onLimpar();
              input.current?.focus();
              setAberto(true);
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={aberto ? "Fechar lista" : "Abrir lista"}
          className="rounded-md p-1.5 text-ink-muted hover:text-ink-primary dark:hover:text-white"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (aberto) return setAberto(false);
            input.current?.focus();
            abrir();
          }}
        >
          <ChevronDown size={16} strokeWidth={2} className={cn("transition-transform", aberto && "rotate-180")} />
        </button>
      </div>

      {aberto && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[10px] border border-border bg-white shadow-lg dark:border-white/15 dark:bg-[#1B1E17]">
          <ul ref={lista} id={`${id}-lista`} role="listbox" className="max-h-80 overflow-y-auto overscroll-contain">
            {opcoes.map((c, i) => (
              <li
                key={c.numero}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === ativo}
                // Não tira o foco do campo antes do clique.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(c)}
                className={cn("cursor-pointer px-3 py-2", i === ativo && "bg-brand-50 dark:bg-white/10")}
              >
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.clienteNome}</p>
                <p className="break-words text-xs text-slate-500 dark:text-white/60">
                  {detalhes(c)}
                  {c.totalPastas > 1 && (
                    <span className="ml-1.5 inline-block rounded-full bg-brand-100 px-1.5 text-[11px] font-semibold text-brand-900">
                      {c.totalPastas} pastas
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
          {opcoes.length === 0 && (
            <p className={cn("px-3 py-3 text-sm", erro ? "text-status-danger" : "text-ink-muted")}>
              {carregando ? "Carregando clientes…" : erro ?? "Nenhum cliente encontrado."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
