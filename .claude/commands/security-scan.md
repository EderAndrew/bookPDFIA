---
allowed-tools: Read, Grep, Glob, Bash(npm audit:*), Bash(pip-audit:*)
description: Scan completo de vulnerabilidades e boas práticas de segurança
argument-hint: "src/auth | src/documents/* | . (padrão: projeto inteiro)"
---

# Security Scan

Analise o código em `$ARGUMENTS` (ou `src/` se não especificado) para 
injeções, autenticação e dados sensíveis.

**Independente do argumento, sempre verifique também:**
- `package.json`, `pnpm-lock.yaml` — vulnerabilidades de dependências
- `src/main.ts`, `*.module.ts` — CORS, headers, debug mode
- Arquivos `.env*` na raiz — secrets commitados

## Injeções e Input
- SQL Injection (queries sem parametrização)
- XSS (outputs sem sanitização)
- Command Injection (uso inseguro de exec/shell)
- Path Traversal (manipulação de caminhos de arquivo)

## Autenticação e Autorização
- Senhas ou tokens hardcoded
- Chaves de API expostas em código ou variáveis de ambiente comitadas
- JWT sem validação adequada
- Falta de verificação de permissões em rotas protegidas

## Dados Sensíveis
- Logs com PII (CPF, email, senha, cartão)
- Dados sensíveis trafegando sem criptografia
- Cookies sem flags `HttpOnly` / `Secure` / `SameSite`

## Dependências
- !`npm audit --json --package-lock-only 2>/dev/null || echo "lockfile não encontrado, pulando npm audit"` (detecta automaticamente o package manager)

## Configurações Inseguras
- CORS muito permissivo (`*`)
- Headers de segurança ausentes (CSP, HSTS, X-Frame-Options)
- Debug mode ou stack traces expostos em produção

## Output esperado
Para cada problema encontrado, informe:
1. **Severidade**: Critical / High / Medium / Low
2. **Arquivo e linha**
3. **Descrição do problema**
4. **Sugestão de correção com exemplo de código**

Priorize por severidade. Seja direto e objetivo.