// Publica firestore.indexes.json no projeto Firebase via API REST (Firestore
// Admin API), pelo mesmo motivo do deploy-firestore-rules.mjs: nem toda máquina
// tem a Firebase CLI instalada/logada.
//
// Uso: npm run deploy:indexes

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";

config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltam credenciais do Admin SDK em .env.local. Veja .env.local.example.");
  process.exit(1);
}

const credential = cert({ projectId, clientEmail, privateKey });
initializeApp({ credential, projectId });

const { access_token: accessToken } = await credential.getAccessToken();
const { indexes } = JSON.parse(readFileSync(new URL("../firestore.indexes.json", import.meta.url), "utf8"));

async function callApi(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${url} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

for (const idx of indexes) {
  const body = { queryScope: idx.queryScope, fields: idx.fields };
  try {
    const op = await callApi(`${base}/collectionGroups/${idx.collectionGroup}/indexes`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`+ índice solicitado para "${idx.collectionGroup}" (${idx.queryScope}): ${op.name ?? "ok"}`);
  } catch (err) {
    if (String(err.message).includes("already exists")) {
      console.log(`✓ índice para "${idx.collectionGroup}" (${idx.queryScope}) já existia.`);
    } else {
      console.error(`x falha no índice de "${idx.collectionGroup}":`, err.message);
    }
  }
}

console.log("\nÍndices solicitados. Eles podem levar alguns minutos para ficar prontos (ver Console > Firestore > Índices).");
process.exit(0);
