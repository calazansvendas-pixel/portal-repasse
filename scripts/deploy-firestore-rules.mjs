// Publica firestore.rules no projeto Firebase via API REST (Firebase Rules API),
// usando as mesmas credenciais do Admin SDK de .env.local. Existe porque nem toda
// máquina do time tem a Firebase CLI instalada/logada — isso evita depender de
// `firebase login` interativo.
//
// Uso: npm run deploy:rules

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
const rulesContent = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

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
  if (!res.ok) {
    throw new Error(`${options?.method ?? "GET"} ${url} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

console.log(`Publicando firestore.rules no projeto "${projectId}"...`);

const ruleset = await callApi(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
  method: "POST",
  body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: rulesContent }] } }),
});
console.log(`Ruleset criado: ${ruleset.name}`);

const releaseBody = { name: `projects/${projectId}/releases/cloud.firestore`, rulesetName: ruleset.name };
try {
  await callApi(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore?updateMask=rulesetName`,
    { method: "PATCH", body: JSON.stringify({ release: releaseBody }) }
  );
  console.log("Release cloud.firestore atualizada.");
} catch {
  await callApi(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
    method: "POST",
    body: JSON.stringify({ release: releaseBody }),
  });
  console.log("Release cloud.firestore criada.");
}

console.log("\nRegras do Firestore publicadas com sucesso.");
process.exit(0);
