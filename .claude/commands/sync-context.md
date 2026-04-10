---
allowed-tools: Read, Edit, Bash
description: Atualiza o CLAUDE.md com o estado atual do projeto
---
Atualize a seção "Contexto atual de desenvolvimento" do CLAUDE.md com:
1. !`git diff --staged --stat`
2. !`git log --oneline -5`
3. O que foi feito nessa sessão
4. O que ainda está pendente
5. Decisões importantes tomadas

Não altere nenhuma outra seção do CLAUDE.md.