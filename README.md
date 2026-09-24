# Portal de Repasse — Morar

Núcleo de gestão da esteira comercial imobiliária: importação diária da planilha
Excel, motor de auditoria ("Daily Delta"), quadros de tarefas regionais e painéis
analíticos, com controle de acesso por perfil (RBAC).

Stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Firebase (Auth +
Firestore), pronto para deploy na Vercel.

## 1. Configurar o Firebase

1. Crie (ou reutilize) um projeto em https://console.firebase.google.com.
2. **Authentication** → Sign-in method → ative **E-mail/senha**.
3. **Firestore Database** → crie o banco (modo produção, região `southamerica-east1`
   ou a mais próxima).
4. **Configurações do projeto → Geral → Seus apps** → adicione um app Web → copie
   os valores do "SDK setup" (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId).
5. **Configurações do projeto → Contas de serviço** → "Gerar nova chave privada"
   → baixa um JSON com `project_id`, `client_email` e `private_key`.
6. Copie `.env.local.example` para `.env.local` e preencha os campos com os
   valores dos passos 4 e 5 (veja os comentários no próprio arquivo). O
   `.env.local` nunca é commitado (já está no `.gitignore`).

## 2. Instalar e rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — você será redirecionado para `/login`.

## 3. Publicar as regras e índices do Firestore

**Sem precisar instalar a Firebase CLI** (usa as mesmas credenciais do Admin SDK
de `.env.local`, via API REST):

```bash
npm run deploy:rules
npm run deploy:indexes
```

Se preferir a [Firebase CLI](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`):

```bash
firebase login
firebase use --add        # selecione o projeto criado no passo 1
firebase deploy --only firestore:rules,firestore:indexes
```

As regras (`firestore.rules`) implementam o RBAC descrito abaixo; sem publicá-las,
o Firestore fica com as regras padrão do projeto e a tela de login trava em
"Conta sem perfil configurado" mesmo com o documento existindo em `users/{uid}`.
Os índices compostos (`firestore.indexes.json`) são necessários para as consultas
dos quadros de tarefas e do gráfico "Evolução Diária".

> `npm run deploy:indexes` pode falhar com `PERMISSION_DENIED` dependendo das
> permissões do service account (a API de índices é mais restrita que a de
> regras). Se isso acontecer, não é bloqueante: a primeira vez que a consulta
> rodar, o Firestore mostra um erro no console do navegador com um link que
> cria o índice certo em um clique — ou use a Firebase CLI (`firebase deploy
> --only firestore:indexes`).

## 4. Criar os 6 usuários iniciais

O script `scripts/seed-users.mjs` cria os usuários no Firebase Auth **e** o
perfil de cada um na coleção `users` do Firestore (role + praça).

1. Abra `scripts/seed-users.mjs` e ajuste e-mails/senhas temporárias.
2. Rode:

```bash
npm run seed:users
```

O script é idempotente (pode rodar de novo sem duplicar usuários). Cada
pessoa deve trocar a senha temporária no primeiro login (tela de "esqueci
minha senha" do Firebase, ou implemente um fluxo de troca obrigatória
depois).

## 5. Modelo de acesso (RBAC)

| Papel | Pessoa | Enxerga |
|---|---|---|
| `gerencia` | Calazans | Tudo — painel gerencial, relatórios, analytics e tarefas de todo mundo |
| `coordenador` | Paulo Fianco | Toda a operação, relatórios gerais, insights de imobiliárias, tarefas da Analista e das Assistentes |
| `analista` | Andressa | Seu painel analítico (gargalos da esteira) + tarefas de todas as Assistentes |
| `assistente` | Laiza (Serra), Eliane (Vila Velha), Catarina (Fátima/Camburi) | Apenas seu próprio quadro de tarefas, filtrado pela cidade do empreendimento |

A lógica de visibilidade fica centralizada em `src/lib/auth/roles.ts` — é o
primeiro lugar a olhar se for preciso ajustar quem vê o quê.

## 6. Importação da planilha e motor de auditoria

- Envie o Excel pela tela **Auditoria de Planilha** (Gerência/Coordenador).
- O parser (`src/lib/services/parseSheet.ts`) procura a aba no padrão
  `"0.01 dd-mm"` (ou usa a primeira aba) e mapeia as colunas: Número, CPF/CNPJ
  (1º Prop), Cidade do empreendimento, Responsáveis pela pasta, Etapa do
  processo, Prazo da etapa, Observação.
- O motor de auditoria (`src/lib/services/auditEngine.ts`) roda no servidor
  (`/api/importar-planilha`, Firebase Admin SDK) e, comparando com o snapshot
  anterior por "Número":
  - cria pastas/tarefas novas;
  - valida tarefas marcadas como resolvidas se a etapa avançou;
  - devolve ao quadro (tag vermelha "Falha de Auditoria") tarefas que não
    avançaram de verdade;
  - grava o snapshot do dia em `registros/{numero}/snapshots/{data}`.

## 7. Deploy na Vercel

1. Suba o repositório para o GitHub/GitLab/Bitbucket.
2. Importe o projeto na Vercel.
3. Configure as mesmas variáveis de `.env.local` em Project Settings →
   Environment Variables (inclusive as `FIREBASE_ADMIN_*`, que ficam só no
   servidor).
4. Deploy.

## Estrutura de pastas (resumo)

```
src/
  app/                     rotas (App Router)
    (painel)/              área logada: dashboard, tarefas, auditoria
    api/                   rotas de servidor (importação + analytics)
    login/
  components/              componentes de UI
  lib/
    auth/                  AuthContext + regras de RBAC
    firebase/              client.ts (browser) e admin.ts (servidor)
    hooks/                 hooks de dados (Firestore em tempo real)
    services/              parse do Excel, motor de auditoria, agregações
    theme/                 dark mode
    types/                 tipos do domínio
    utils/                 SLA, datas, classnames
```
