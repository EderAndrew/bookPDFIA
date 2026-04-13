---
allowed-tools: Read, Grep, Glob, Bash(pnpm audit:*)
description: Scan completo de autenticação e sessão - JWT, OAuth2, Cookies e gerenciamento de sessão
argument-hint: "src/auth/*"
---

# Authentication & Session Security Scan

Analise `$ARGUMENTS` (ou todo o projeto se não especificado) verificando todos os aspectos de autenticação e gerenciamento de sessão.

---

## 1. JWT (JSON Web Tokens)

### Configuração e Assinatura
- Algoritmo `none` aceito (vulnerabilidade crítica)
- Uso de HS256 com secret fraco ou previsível (menos de 32 caracteres)
- Secret JWT hardcoded no código-fonte ou versionado
- Ausência de rotação de secrets
- Uso de RS256/ES256 sem proteção adequada da chave privada

### Claims e Validação
- Ausência de validação do claim `exp` (token sem expiração)
- Ausência de validação do claim `iss` (issuer)
- Ausência de validação do claim `aud` (audience)
- Claims de role/permissão não validados no servidor
- `nbf` (not before) não verificado

### Armazenamento e Transmissão
- Token armazenado em localStorage (vulnerável a XSS)
- Token armazenado em sessionStorage (vulnerável a XSS)
- Token exposto em query params na URL (aparece em logs)
- Ausência de HTTPS na transmissão
- Token não invalidado após logout (ausência de blacklist/denylist)
- Refresh token sem rotação após uso
- Refresh token sem expiração absoluta

### Implementação
- Biblioteca JWT desatualizada ou com CVEs conhecidos
- !`pnpm audit --json 2>/dev/null | grep -i jwt || echo "Nenhuma vulnerabilidade JWT encontrada nos pacotes"`
- Decode sem verificação de assinatura (`jwt.decode` ao invés de `jwt.verify`)
- Exceções de validação JWT capturadas silenciosamente (catch vazio)

---

## 2. OAuth2 / OpenID Connect

### Fluxo de Autorização
- Ausência de validação do parâmetro `state` (proteção contra CSRF)
- `state` previsível ou não gerado com entropia suficiente
- Uso do fluxo Implicit (deprecated) ao invés de Authorization Code + PKCE
- PKCE ausente em aplicações SPA ou mobile
- `code_verifier` fraco ou reutilizado

### Tokens OAuth2
- `access_token` com escopo excessivo (`scope: *`)
- Ausência de validação do `id_token` (claims iss, aud, exp, nonce)
- `nonce` ausente ou não validado (proteção contra replay attacks)
- Redirect URIs sem validação estrita (open redirect)
- Redirect URI com wildcard (`https://app.com/*`)

### Client Credentials
- `client_secret` exposto no frontend (SPA, app mobile)
- `client_secret` hardcoded no código-fonte
- Ausência de rotação de client secrets
- Client ID/Secret versionados no repositório

### Providers e Configuração
- Discovery endpoint (.well-known) não verificado
- Validação manual de tokens ao invés de usar biblioteca estabelecida
- Ausência de validação de certificados do provider

---

## 3. Cookies Seguros

### Flags de Segurança
- Ausência da flag `HttpOnly` (expõe token a XSS)
- Ausência da flag `Secure` (permite transmissão via HTTP)
- `SameSite` ausente ou configurado como `None` sem `Secure`
- `SameSite=Lax` em endpoints que recebem POST cross-origin
- `SameSite=Strict` faltando em áreas críticas (admin, financeiro)

### Escopo e Duração
- `Domain` muito amplo (ex: `.empresa.com` expõe subdomínios)
- `Path` muito permissivo (`/` para cookies sensíveis)
- `Max-Age` ou `Expires` ausente (session cookie não intencional)
- Cookie de sessão com expiração muito longa (> 24h sem justificativa)
- Cookie persistente para sessão de alta segurança

### Conteúdo
- Dados sensíveis armazenados diretamente no cookie sem criptografia
- Cookie de sessão com ID previsível ou sequencial
- Ausência de assinatura no cookie (vulnerável a tampering)
- Cookie sem versionamento (impossível invalidar em massa)

---

## 4. Gerenciamento de Sessão

### Criação e Identificação
- Session ID com entropia insuficiente (menos de 128 bits)
- Session ID previsível (baseado em timestamp, ID do usuário)
- Session ID exposto em URLs ou logs
- Ausência de regeneração de Session ID após login (session fixation)
- Ausência de regeneração após elevação de privilégio (sudo, MFA)

### Ciclo de Vida
- Ausência de timeout por inatividade
- Timeout de inatividade excessivo (> 30 min para áreas críticas)
- Ausência de expiração absoluta da sessão
- Sessão não invalidada no servidor após logout
- Logout apenas no cliente (remove cookie mas mantém sessão ativa no servidor)
- Ausência de opção "encerrar todas as sessões" (outros dispositivos)

### Controle Concorrente
- Múltiplas sessões simultâneas sem controle ou notificação
- Ausência de detecção de sessão simultânea em contas críticas
- Ausência de registro de dispositivos/localização por sessão

### Proteções Adicionais
- Ausência de binding de sessão por IP ou User-Agent
- CSRF token ausente em formulários e requisições mutáveis (POST/PUT/DELETE)
- CSRF token não rotacionado por requisição
- CSRF token com vida útil muito longa
- Double Submit Cookie sem validação adequada

---

## 5. Proteções Gerais de Autenticação

### Brute Force e Rate Limiting
- Ausência de rate limiting no endpoint de login
- Ausência de bloqueio progressivo (lockout) após falhas consecutivas
- Lockout sem notificação ao usuário legítimo
- Ausência de rate limiting em reset de senha
- Ausência de rate limiting em verificação de OTP/MFA

### Fluxos Críticos
- Reset de senha com token previsível ou sem expiração
- Token de reset reutilizável após uso
- Token de reset não invalidado após nova solicitação
- Enumeração de usuários via mensagens de erro diferentes
- Enumeração de usuários via diferença de tempo de resposta
- Magic links sem expiração ou reutilizáveis

### MFA (Multi-Factor Authentication)
- MFA ausente em áreas administrativas ou críticas
- Códigos TOTP sem janela de tempo adequada
- Ausência de invalidação de códigos de backup após uso
- Recovery codes armazenados sem hash
- MFA bypassável via fluxo alternativo de autenticação

### Armazenamento de Credenciais
- Senhas sem hash (armazenadas em texto plano ou encoding)
- Uso de MD5 ou SHA1 para hash de senhas
- Hash sem salt (vulnerável a rainbow tables)
- Ausência de algoritmo moderno (bcrypt, argon2, scrypt)
- Work factor do bcrypt abaixo de 12
- Política de senha fraca (sem comprimento mínimo, sem complexidade)

---

## Formato do Relatório

Para cada problema encontrado, informe:

| Campo | Detalhe |
|---|---|
| **Categoria** | JWT / OAuth2 / Cookie / Sessão / Geral |
| **Severidade** | 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low |
| **Arquivo** | Caminho + número da linha |
| **Problema** | Descrição clara da vulnerabilidade |
| **Evidência** | Trecho do código problemático |
| **Correção** | Exemplo de código corrigido |
| **Referência** | Link OWASP ou RFC relevante |

---

## Resumo Final

Ao concluir, apresente:

1. **Contagem por severidade** (Critical / High / Medium / Low)
2. **Contagem por categoria** (JWT / OAuth2 / Cookie / Sessão)
3. **Top 3 problemas mais urgentes** para corrigir imediatamente
4. **Score de maturidade** de 0 a 10 para cada categoria analisada
5. **Próximos passos recomendados** em ordem de prioridade

### Referências
- OWASP Session Management: https://owasp.org/www-community/attacks/Session_fixation
- OWASP JWT Security: https://owasp.org/www-project-web-security-testing-guide/
- OWASP OAuth2: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
- RFC 6749 (OAuth2): https://datatracker.ietf.org/doc/html/rfc6749
- RFC 7519 (JWT): https://datatracker.ietf.org/doc/html/rfc7519