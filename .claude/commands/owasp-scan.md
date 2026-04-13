---
allowed-tools: Read, Grep, Glob, Bash(pnpm audit:*), Bash(git log:*)
description: Scan de segurança baseado no OWASP Top 10 2021
argument-hint: "sr/*"
---

# OWASP Top 10 Security Scan

Analise `$ARGUMENTS` (ou todo o projeto se não especificado) seguindo rigorosamente o OWASP Top 10 2021.

---

## A01 - Broken Access Control
- Rotas sem verificação de autenticação/autorização
- IDOR (acesso direto a objetos por ID sem validar dono)
- CORS mal configurado (`*` ou origens não confiáveis)
- Usuário comum acessando endpoints administrativos
- JWT sem validação de claims (role, sub, exp)

## A02 - Cryptographic Failures
- Dados sensíveis trafegando sem HTTPS
- Senhas armazenadas sem hash (bcrypt/argon2)
- Uso de MD5 ou SHA1 para senhas
- Chaves privadas ou secrets no código-fonte
- Cookies sem flag `Secure` e `HttpOnly`
- Dados sensíveis em localStorage (cartão, senha, token)

## A03 - Injection
- SQL Injection: queries com concatenação de string
- NoSQL Injection: filtros MongoDB sem sanitização
- Command Injection: uso de exec/spawn com input do usuário
- LDAP Injection
- XSS Refletido, Armazenado e baseado em DOM
- Template Injection (SSTI)

## A04 - Insecure Design
- Ausência de rate limiting em endpoints críticos (login, reset de senha)
- Fluxos sem validação de estado (ex: pular etapas de checkout)
- Recuperação de senha insegura (perguntas secretas, token previsível)
- Ausência de CAPTCHA em formulários públicos críticos

## A05 - Security Misconfiguration
- Headers de segurança ausentes (CSP, HSTS, X-Frame-Options, X-Content-Type)
- Stack traces ou mensagens de erro detalhadas expostas ao usuário
- Debug mode ativo em produção
- Diretórios sensíveis expostos (.env, .git, /admin)
- Permissões excessivas em arquivos ou buckets S3

## A06 - Vulnerable and Outdated Components
- !`pnpm audit --json 2>/dev/null || echo "Execute pnpm install primeiro"`
- Dependências sem versão fixada (usando * ou latest)
- Pacotes sem manutenção ativa
- Versões com CVEs conhecidos

## A07 - Identification and Authentication Failures
- Ausência de bloqueio após tentativas de login (brute force)
- Tokens sem expiração definida
- Sessões não invalidadas após logout
- Senhas fracas sem política de complexidade
- Ausência de MFA em áreas críticas
- Tokens previsíveis ou sequenciais

## A08 - Software and Data Integrity Failures
- Deserialização de dados sem validação
- Dependências carregadas de CDN sem SRI (Subresource Integrity)
- Pipelines de CI/CD sem verificação de integridade
- Auto-update sem verificação de assinatura

## A09 - Security Logging and Monitoring Failures
- Ausência de logs em eventos críticos (login, falha de auth, alteração de dados)
- Logs com dados sensíveis (senha, CPF, cartão, token)
- Logs sem timestamp ou identificação do usuário
- Ausência de alertas para comportamento suspeito
- !`git log --oneline -10` (verifica histórico recente de alterações em arquivos críticos)

## A10 - Server-Side Request Forgery (SSRF)
- Requisições a URLs fornecidas pelo usuário sem validação
- Ausência de allowlist de domínios permitidos
- Acesso a metadata de cloud (169.254.169.254) sem bloqueio
- Redirecionamentos sem validação de destino

---

## Formato do relatório

Para cada vulnerabilidade encontrada, informe:

| Campo | Detalhe |
|---|---|
| **OWASP** | A0X - Nome da categoria |
| **Severidade** | 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low |
| **Arquivo** | Caminho + número da linha |
| **Problema** | Descrição clara da vulnerabilidade |
| **Evidência** | Trecho do código problemático |
| **Correção** | Exemplo de código corrigido |

---

## Ao finalizar

1. Mostre um resumo com contagem por severidade
2. Ordene os problemas de Critical para Low
3. Indique os 3 problemas mais urgentes para corrigir primeiro
4. Sugira referências da documentação OWASP para cada categoria encontrada