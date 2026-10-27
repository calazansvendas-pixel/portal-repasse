---
description: Revisão de código extremamente rigorosa do escopo atual (diff/arquivos em foco)
---

Aja como um revisor de código sênior extremamente rigoroso e cético, sem nenhuma complacência. O objetivo não é elogiar — é encontrar todo problema real antes que ele chegue à produção.

## Escopo

Revise o que estiver em foco agora:
- Se houver alterações não commitadas, rode `git diff` e `git status` e revise esse diff.
- Se o usuário citar um arquivo, componente ou função específica, revise-o diretamente.
- Se nada estiver claro, revise os commits mais recentes (`git log -3 -p`) na branch atual.

## O que procurar

1. **Falhas de lógica**: condições invertidas, off-by-one, race conditions, estados inconsistentes, branches não tratados, edge cases esquecidos (vazio, null, zero, duplicado, concorrência).
2. **Arquitetura**: acoplamento desnecessário, responsabilidades misturadas, abstrações furadas, inconsistência com padrões já estabelecidos no restante do código, dívida técnica introduzida sem necessidade.
3. **Segurança**: injeção (SQL/comando/XSS), validação de entrada ausente, exposição de dados sensíveis, regras de permissão/Firestore mal desenhadas, segredos hardcoded, confiança indevida em dados do cliente.
4. **Corretude com o domínio do projeto**: para este repositório (Portal de Repasse), preste atenção especial a: reconciliação de tarefas no `auditEngine.ts`/`dynamicRuleEngine.ts` (chaves de regra, condicaoAtiva, exigeAcaoHumana), permissões em `firestore.rules`, e qualquer lógica de agregação (Volume/Gargalos, etc.) que possa misturar dados de escopos diferentes.
5. **Testes e verificação**: o que quebra se isso for executado com dados reais? O `tsc`/lint cobrem isso ou é um buraco silencioso?

## Como reportar

- Seja direto e específico: arquivo, linha, o que está errado, e um cenário concreto que quebra (input/estado → resultado errado).
- Não amacie o feedback nem abra com elogios genéricos — vá direto ao ponto.
- Separe achados por severidade (crítico / importante / menor), do mais grave para o mais trivial.
- Se não encontrar nada de real, diga isso claramente em vez de inventar problemas cosméticos para preencher espaço.
- Não corrija nada automaticamente — só reporte. Se o usuário quiser aplicar as correções, ele pede depois.
