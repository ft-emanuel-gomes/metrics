# Runbook — Token do Jira / Deploy EC2

Operação e segurança do `JIRA_API_TOKEN` usado pelo sistema de métricas.

## Contexto

O backend autentica na API do Jira com Basic Auth (`JIRA_EMAIL` + `JIRA_API_TOKEN`).
O login do sistema depende desse token: `validateUserByEmail()` chama
`/rest/api/3/user/search`. Se o token estiver inválido, a chamada falha
silenciosamente (retorna lista vazia) e o usuário vê **"Usuário não encontrado
ou sem acesso ao sistema"** — mesmo sendo um usuário válido.

Produção: EC2 `54.161.68.45` (origem do CloudFront `d3ous1nh7xo4k4.cloudfront.net`),
app rodando via PM2 (`pm2 restart metrics`), `.env` em `/home/ec2-user/metrics/.env`.

---

## 1. Revogar o token antigo (passo MANUAL)

Tokens de API **pessoais** da Atlassian não podem ser revogados via API — só pela UI.
(Endpoint REST de revogação existe apenas via Admin API de organização, por `orgId`.)

1. Acesse https://id.atlassian.com/manage-profile/security/api-tokens
   logado como o dono do token (`emanuel.gomes@montebravo.com.br`).
2. Localize o token antigo (criado para o sistema de métricas) e clique em **Revoke / Excluir**.
3. Confirme.

> O token antigo (final `...88AAEB78`) já retorna HTTP 401 (inválido). A revogação
> formal na UI garante que ele não fique listado nem possa ser reativado.
> O valor antigo já foi removido de todos os arquivos da EC2 (inclusive backups,
> onde foi substituído por `<REDACTED_REVOKED_2026-11-05>`).

### Boas práticas ao gerar o novo token
- Prefira uma **Service Account dedicada**, não uma conta pessoal
  (https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/).
- Defina expiração (a Atlassian expira novos tokens em 1 ano por padrão) e agende rotação.

---

## 2. Atualizar o token em produção

```powershell
$key = "$env:USERPROFILE\.ssh\metrics-key.pem"
$NEW = "<novo-token>"
# backup + substituição segura só da linha do token
ssh -i $key ec2-user@54.161.68.45 "cp ~/metrics/.env ~/metrics/.env.bak.\$(date +%Y%m%d%H%M%S)"
# (use python/sed para trocar APENAS a linha JIRA_API_TOKEN=)
ssh -i $key ec2-user@54.161.68.45 "pm2 restart metrics --update-env"
```

### Validação (obrigatória)
```powershell
# 1) token autentica?  (deve dar HTTP 200)
$pair = "emanuel.gomes@montebravo.com.br:$NEW"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
Invoke-WebRequest -Uri "https://montebravo.atlassian.net/rest/api/3/myself" `
  -Headers @{ Authorization = "Basic $b64" } -UseBasicParsing | % StatusCode

# 2) login de produção não retorna mais USER_NOT_FOUND?
Invoke-WebRequest -Uri "https://d3ous1nh7xo4k4.cloudfront.net/api/auth/login" `
  -Method Post -ContentType "application/json" `
  -Body '{"email":"emanuel.gomes@montebravo.com.br"}' -UseBasicParsing | % Content
# Esperado: HTTP 200 com needsOAuth:true (e NÃO 401 USER_NOT_FOUND)
```

---

## 3. Deploy de nova instância (`deploy-ec2.ps1`)

O script **não contém segredos**. Os valores sensíveis vêm de fora:

- **Modo SSM (padrão, recomendado):** os segredos ficam no AWS SSM Parameter Store
  como `SecureString` e são buscados no boot da instância. Não aparecem no user-data.
  Requer um IAM Instance Profile com `ssm:GetParameter`.

  ```powershell
  # gravar segredos uma vez
  aws ssm put-parameter --name /metrics/JIRA_API_TOKEN      --type SecureString --value "ATATT..."
  aws ssm put-parameter --name /metrics/S3_ACCESS_KEY       --type SecureString --value "..."
  aws ssm put-parameter --name /metrics/S3_SECRET_KEY       --type SecureString --value "..."
  aws ssm put-parameter --name /metrics/JWT_SECRET          --type SecureString --value "..."
  aws ssm put-parameter --name /metrics/ATLASSIAN_CLIENT_ID     --type SecureString --value "..."
  aws ssm put-parameter --name /metrics/ATLASSIAN_CLIENT_SECRET --type SecureString --value "..."

  .\deploy-ec2.ps1 -SecretSource Ssm -SsmPrefix /metrics -IamInstanceProfile metrics-ec2-role
  ```

- **Modo Env (teste):** os segredos vêm de variáveis de ambiente do operador.
  ⚠️ Ficam embutidos no user-data (texto visível na console da EC2). Use só em ambiente isolado.

  ```powershell
  $env:JIRA_API_TOKEN = "ATATT..."
  $env:S3_ACCESS_KEY = "..."; $env:S3_SECRET_KEY = "..."
  $env:JWT_SECRET = "..."
  $env:ATLASSIAN_CLIENT_ID = "..."; $env:ATLASSIAN_CLIENT_SECRET = "..."
  .\deploy-ec2.ps1 -SecretSource Env
  ```

O script valida que todos os segredos existem antes de lançar a instância (fail fast),
define `chmod 600` no `.env` e usa `pm2 save` para sobreviver a reboots.

---

## Observações de segurança

- `.env` está no `.gitignore` e nunca foi versionado — os tokens não vazaram pelo git.
- Não cole tokens em chat, tickets ou logs. Trate como credencial de produção.
- Agende rotação periódica do token (ex.: a cada 90 dias) e do `JWT_SECRET`.
