"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeVerRelatoriosGerais, podeVerPainelAnalitico } from "@/lib/auth/roles";
import { temPermissao } from "@/lib/auth/cargos";
import { Topbar } from "@/components/layout/Topbar";
import { UploadSheet } from "@/components/auditoria/UploadSheet";
import { AuditTable } from "@/components/auditoria/AuditTable";
import { HistoricoImportacoes } from "@/components/auditoria/HistoricoImportacoes";

export default function AuditoriaPage() {
  const { profile } = useAuth();
  // Enquanto uma importação está em andamento, pausa os listeners onSnapshot da tabela e do
  // histórico (ver UploadSheet/AuditTable/HistoricoImportacoes) — o motor de auditoria atualiza
  // `atualizadoEm` em toda pasta tocada, e com os listeners ligados cada lote de escrita reordena
  // essas queries e cobra leituras extras no plano Blaze.
  const [importando, setImportando] = useState(false);
  if (!profile) return null;

  const podeImportar = temPermissao(profile, "importarPlanilhas");
  // As tabelas leem as pastas direto do Firestore: só os perfis que as regras liberam.
  const podeVerTabelas = podeVerRelatoriosGerais(profile.role) || podeVerPainelAnalitico(profile.role);
  const podeVerPagina = podeVerTabelas || podeImportar;
  if (!podeVerPagina) {
    return (
      <div>
        <Topbar titulo="Auditoria de Planilha" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Auditoria de Planilha" />
      {podeImportar && <UploadSheet onEnviandoChange={setImportando} />}
      {podeVerTabelas && (
        <>
          <AuditTable pausado={importando} />
          <HistoricoImportacoes pausado={importando} />
        </>
      )}
    </div>
  );
}
