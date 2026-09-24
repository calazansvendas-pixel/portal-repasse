"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { podeImportarPlanilha, podeVerRelatoriosGerais, podeVerPainelAnalitico } from "@/lib/auth/roles";
import { Topbar } from "@/components/layout/Topbar";
import { UploadSheet } from "@/components/auditoria/UploadSheet";
import { AuditTable } from "@/components/auditoria/AuditTable";
import { HistoricoImportacoes } from "@/components/auditoria/HistoricoImportacoes";

export default function AuditoriaPage() {
  const { profile } = useAuth();
  if (!profile) return null;

  const podeVerPagina = podeVerRelatoriosGerais(profile.role) || podeVerPainelAnalitico(profile.role);
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
      {podeImportarPlanilha(profile.role) && <UploadSheet />}
      <AuditTable />
      <HistoricoImportacoes />
    </div>
  );
}
