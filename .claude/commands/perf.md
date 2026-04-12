---
allowed-tools: Read, Grep, Glob
description: Identifica gargalos de performance
argument-hint: "src/*"
---
Analise `$ARGUMENTS` em busca de problemas de performance:
- N+1 queries
- Loops desnecessários ou aninhados
- Operações síncronas que deveriam ser assíncronas
- Falta de cache em operações custosas
- Imports desnecessários aumentando bundle

Indique severidade e sugira otimização com exemplo.