"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Modais empilhados (ex: detalhe do cliente sobre o detalhe da tarefa): o Esc fecha só o de cima.
const pilha: symbol[] = [];

export function Modal({
  titulo,
  onClose,
  semMoldura = false,
  rodape,
  children,
}: {
  titulo: string;
  onClose: () => void;
  // Conteúdo que já é um cartão (ex: TaskCard): sem moldura nem título próprios.
  semMoldura?: boolean;
  // Só com `semMoldura`: barra fixa abaixo da área rolável (ex: botão Fechar sempre à mão no celular).
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const id = useRef(Symbol("modal"));
  // O onClose costuma ser uma arrow nova a cada render: guardá-lo em ref evita re-registrar o
  // modal (e reordenar a pilha) toda vez que o pai renderiza.
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    const meu = id.current;
    // Trava a rolagem da página enquanto houver modal aberto (no celular a página rolava por trás).
    const overflowAnterior = pilha.length === 0 ? document.body.style.overflow : null;
    pilha.push(meu);
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && pilha[pilha.length - 1] === meu) fechar.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      pilha.splice(pilha.indexOf(meu), 1);
      if (pilha.length === 0) document.body.style.overflow = overflowAnterior ?? "";
    };
  }, []);

  // 100dvh acompanha a barra de endereço do navegador do celular (100vh a ignora e corta o fim do modal).
  const alturaMaxima = "max-h-[calc(100dvh-1.5rem)] sm:max-h-[85vh]";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/50 p-3 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      {semMoldura ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          className={`flex w-full max-w-lg flex-col gap-3 ${alturaMaxima}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth rounded-lg">
            {children}
          </div>
          {rodape}
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          className={`surface-card w-full max-w-lg overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-6 ${alturaMaxima}`}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-4 break-words text-base font-bold text-ink-primary dark:text-white">{titulo}</h2>
          {children}
        </div>
      )}
    </div>,
    document.body
  );
}
