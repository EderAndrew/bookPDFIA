---
allowed-tools: Read, Grep, Glob
description: Code review com foco em qualidade e boas práticas
argument-hint: "src/ai/* | src/auth/* | src/documents/* | src/organizations/*"
---
Faça um code review de `$ARGUMENTS` verificando:
- Clareza e legibilidade
- Princípios SOLID e Clean Code
- Duplicação de código (DRY)
- Complexidade ciclomática alta
- Funções/classes com muita responsabilidade
- Nomes de variáveis/funções sem semântica clara

Para cada problema: severidade, arquivo/linha, descrição e sugestão com exemplo.