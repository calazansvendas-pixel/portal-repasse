"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Modais empilhados (ex: detalhe do cliente sobre o detalhe da tarefa): o Esc fecha só o de cima.
const pilha: symbol[] = [];

export function Modal({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useRef(Symbol("modal"));
  // O onClose costuma ser uma arrow nova a cada render: guardá-lo em ref evita re-registrar o
  // modal (e reordenar a pilha) toda vez que o pai renderiza.
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    const meu = id.current;
    pilha.push(meu);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && pilha[pilha.length - 1] === meu) fechar.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      pilha.splice(pilha.indexOf(meu), 1);
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="surface-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-bold text-ink-primary dark:text-white">{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
