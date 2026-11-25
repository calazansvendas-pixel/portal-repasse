# CLAUDE.md — Portal de Repasse (Morar)

Diretrizes obrigatórias para toda sessão de trabalho neste projeto.

## 1. Identidade e Design System Morar

| Item | Valor |
|---|---|
| Verde Morar (principal) | `#006B3F` |
| Hover | `#005230` |
| Fundo da página | `#F8FAF9` |
| Cards | `#FFFFFF`, borda `#E5E8E6`, radius `14px` |
| Inputs | radius `8px` |
| Botões | radius `10px` |
| Tipografia | Montserrat (títulos) e Inter (textos) |

- Toda tela deve ser 100% responsiva: mobile-first, conferida também no desktop.
- Referência complementar: `design-system/`.
- Divergência conhecida: `tailwind.config.ts` ainda usa hover `#004F32`, fundo `#F8F9F8` e botões com 8px
  (os mesmos valores da Skill app-morar). Vale a tabela acima para o que for novo; não repinte telas
  existentes sem pedido.

## 2. Segurança do banco de dados (Firestore)

- Nunca apagar, resetar ou sobrescrever coleções existentes em produção sem backup explícito.
- Nunca publicar alterações em `firestore.rules` sem autorização expressa do Dono. Alterações ficam
  prontas no repositório até lá (`npm run deploy:rules` é publicação).
- `localhost`, homologação e produção usam o **mesmo** Firestore: qualquer gravação de teste é real.
  Scripts em `scripts/` que alteram dados: rodar primeiro sem `--apply`, quando houver essa opção, e
  ler o script antes.

## 3. Fluxo obrigatório em 3 camadas

Nunca avançar de camada sem aprovação explícita.

### Camada 1 — `localhost` / branch de feature
- Toda alteração é desenvolvida localmente, validada com `npm run build` sem erros e testada no
  navegador antes de qualquer push.
- Nunca commitar nem dar push sem aprovação explícita.

### Camada 2 — branch fixa `homologacao` (só após aprovar o local)
```bash
git fetch origin && git checkout -B homologacao origin/main && git merge <branch-local>
git push -u origin homologacao --force-with-lease
git checkout <branch-local>
```
Informar **exclusivamente** o link fixo oficial:
https://portal-repasse-git-homologacao-calazans1.vercel.app
(nunca exibir links temporários com hash).

### Camada 3 — `main` / produção (só após aprovar a homologação)
Fazer merge de `homologacao` na `main`, enviar para `origin main` e sincronizar `homologacao`.

## 4. Autenticação e gestão

Consultar a Skill oficial `app-morar` sempre que evoluir telas de login, cadastro, permissões ou
administração (começar por `SKILL_APP_MORAR.md`). Ela fica fora deste repositório.

No código: cargos e permissões em `src/lib/auth/cargos.ts`; menus da barra lateral em
`src/lib/auth/menus.ts` (rota nova no painel precisa entrar lá para ter proteção de acesso).

## 5. Notas práticas

- Este repositório é **público** no GitHub: nada de credenciais, `.env.local` ou dados de clientes em
  arquivos versionados.
- Antes do `npm run build`, parar o servidor de desenvolvimento e apagar `.next`. Falha ao baixar as
  fontes do Google (`next/font`) costuma passar ao repetir.
