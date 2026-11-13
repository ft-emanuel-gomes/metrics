<#
.SYNOPSIS
  Provisiona uma instância EC2 com a aplicação montebravo-metrics (Next.js + PM2).

.DESCRIPTION
  Este script NÃO contém segredos. Todos os valores sensíveis (token do Jira, JWT,
  credenciais OAuth, etc.) são lidos em tempo de deploy a partir de variáveis de
  ambiente OU, de forma preferencial, do AWS SSM Parameter Store (SecureString).

  Há dois modos de injeção do .env na instância:

    -SecretSource Ssm   (PADRÃO, recomendado)
        O .env é montado DENTRO da instância buscando os parâmetros do SSM
        Parameter Store em tempo de boot. Os segredos nunca aparecem no user-data
        (que é visível em texto na console da EC2 e no IMDS).
        Requer um IAM Instance Profile com permissão ssm:GetParameter(s)ByPath.

    -SecretSource Env
        O .env é montado a partir de variáveis de ambiente locais do operador.
        Mais simples, porém os segredos ficam embutidos no user-data em texto.
        Use apenas em contas isoladas / ambientes de teste.

.EXAMPLE
  # Modo SSM (recomendado): grave os segredos uma vez e reutilize em todo deploy
  aws ssm put-parameter --name /metrics/JIRA_API_TOKEN --type SecureString --value "ATATT..."
  .\deploy-ec2.ps1 -SecretSource Ssm -SsmPrefix /metrics -IamInstanceProfile metrics-ec2-role

.EXAMPLE
  # Modo Env: exporte as variáveis antes de rodar
  $env:JIRA_API_TOKEN = "ATATT..."
  $env:JWT_SECRET = "..."
  .\deploy-ec2.ps1 -SecretSource Env
#>

[CmdletBinding()]
param(
    [ValidateSet("Ssm", "Env")]
    [string]$SecretSource = "Ssm",

    # --- Parâmetros de infraestrutura ---
    [string]$Region = "us-east-1",
    [string]$ImageId = "ami-0c02fb55956c7d316",
    [string]$InstanceType = "t2.small",
    [string]$KeyName = "metrics-key",
    [string]$SecurityGroupId = "sg-070dd9d8043415864",
    [string]$InstanceName = "metrics-app",

    # IAM Instance Profile com permissão de ler os parâmetros no SSM (modo Ssm)
    [string]$IamInstanceProfile = "metrics-ec2-role",

    # Prefixo dos parâmetros no SSM Parameter Store (modo Ssm)
    [string]$SsmPrefix = "/metrics",

    # Branch a implantar
    [string]$GitBranch = "main",
    [string]$GitRepo = "https://github.com/ft-emanuel-gomes/metrics.git",

    # Domínio público (CloudFront) para o redirect do OAuth
    [string]$PublicBaseUrl = "https://d3ous1nh7xo4k4.cloudfront.net"
)

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$env:AWS_PAGER = ""

if (-not (Test-Path $aws)) {
    throw "AWS CLI não encontrado em $aws. Instale o AWS CLI v2."
}

# ---------------------------------------------------------------------------
# Variáveis NÃO sensíveis (podem ficar no script com segurança)
# ---------------------------------------------------------------------------
$nonSecretEnv = @{
    JIRA_BASE_URL             = "https://montebravo.atlassian.net"
    JIRA_EMAIL                = "emanuel.gomes@montebravo.com.br"
    S3_BUCKET                 = "monte-bravo-metrics-data"
    S3_REGION                 = "us-east-1"
    JWT_EXPIRES_IN            = "30d"
    ATLASSIAN_REDIRECT_URI    = "$PublicBaseUrl/api/auth/callback"
    USE_DATABASE_METRICS      = "false"
    NODE_TLS_REJECT_UNAUTHORIZED = "0"
    PORT                      = "3000"
}

# ---------------------------------------------------------------------------
# Segredos exigidos (nunca hardcoded)
# ---------------------------------------------------------------------------
$secretKeys = @(
    "JIRA_API_TOKEN",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "JWT_SECRET",
    "ATLASSIAN_CLIENT_ID",
    "ATLASSIAN_CLIENT_SECRET"
)

# ===========================================================================
# Monta o trecho do user-data que gera o .env, conforme o modo escolhido
# ===========================================================================
if ($SecretSource -eq "Env") {

    # Coleta segredos das variáveis de ambiente do operador e valida
    $missing = @()
    $secretValues = @{}
    foreach ($k in $secretKeys) {
        $v = [Environment]::GetEnvironmentVariable($k)
        if ([string]::IsNullOrWhiteSpace($v)) { $missing += $k } else { $secretValues[$k] = $v }
    }
    if ($missing.Count -gt 0) {
        throw "Segredos ausentes nas variáveis de ambiente: $($missing -join ', '). " +
              "Exporte-os antes de rodar (ex.: `$env:JIRA_API_TOKEN = '...') ou use -SecretSource Ssm."
    }

    Write-Host "[deploy] Modo Env: segredos lidos do ambiente local (" -NoNewline
    Write-Host "atenção: ficam visíveis no user-data" -ForegroundColor Yellow -NoNewline
    Write-Host ")."

    # Gera as linhas do .env (não-segredos + segredos)
    $envLines = @()
    foreach ($kv in $nonSecretEnv.GetEnumerator()) { $envLines += "$($kv.Key)=$($kv.Value)" }
    foreach ($k in $secretKeys) { $envLines += "$k=$($secretValues[$k])" }
    $envBody = ($envLines -join "`n")

    $writeEnvScript = @"
cat > .env << 'ENVEOF'
$envBody
ENVEOF
"@

} else {
    # Modo SSM: os segredos são buscados no boot, dentro da instância.
    Write-Host "[deploy] Modo SSM: segredos serão buscados do Parameter Store ($SsmPrefix/*) no boot."
    Write-Host "[deploy] Garanta que os parâmetros existem como SecureString, ex.:"
    foreach ($k in $secretKeys) { Write-Host "         aws ssm put-parameter --name $SsmPrefix/$k --type SecureString --value <valor>" }

    # Linhas não-secretas vão direto; segredos são resolvidos via `aws ssm get-parameter`
    $nonSecretLines = @()
    foreach ($kv in $nonSecretEnv.GetEnumerator()) { $nonSecretLines += "$($kv.Key)=$($kv.Value)" }
    $nonSecretBody = ($nonSecretLines -join "`n")

    $ssmFetchLines = foreach ($k in $secretKeys) {
        "echo `"$k=`$(aws ssm get-parameter --name $SsmPrefix/$k --with-decryption --query Parameter.Value --output text --region $Region)`" >> .env"
    }
    $ssmFetchBody = ($ssmFetchLines -join "`n")

    $writeEnvScript = @"
cat > .env << 'ENVEOF'
$nonSecretBody
ENVEOF
# Resolve segredos do SSM Parameter Store (SecureString) no boot
$ssmFetchBody
chmod 600 .env
"@
}

# ===========================================================================
# user-data completo (Amazon Linux 2 / yum)
# ===========================================================================
$userData = @"
#!/bin/bash
exec > /var/log/user-data.log 2>&1
set -ex

# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

cd /home/ec2-user
git clone $GitRepo metrics
cd metrics
git checkout $GitBranch

$writeEnvScript
chown ec2-user:ec2-user .env
chmod 600 .env

export NODE_TLS_REJECT_UNAUTHORIZED=0
npm install --legacy-peer-deps
npm run build

npm install -g pm2
sudo -u ec2-user pm2 start npm --name metrics -- start
pm2 startup systemd -u ec2-user --hp /home/ec2-user
sudo -u ec2-user pm2 save

# Redireciona porta 80 -> 3000
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 3000

echo "DEPLOY COMPLETE" >> /var/log/user-data.log
"@

$userDataBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($userData -replace "`r`n", "`n")))

# ===========================================================================
# Lança a instância
# ===========================================================================
$runArgs = @(
    "ec2", "run-instances",
    "--image-id", $ImageId,
    "--instance-type", $InstanceType,
    "--key-name", $KeyName,
    "--security-group-ids", $SecurityGroupId,
    "--count", "1",
    "--region", $Region,
    "--tag-specifications", "ResourceType=instance,Tags=[{Key=Name,Value=$InstanceName}]",
    "--user-data", $userDataBase64,
    "--query", "Instances[0].{InstanceId:InstanceId,State:State.Name}",
    "--output", "table"
)
if ($SecretSource -eq "Ssm" -and $IamInstanceProfile) {
    $runArgs += @("--iam-instance-profile", "Name=$IamInstanceProfile")
}

& $aws @runArgs

Write-Host "`nDeploy iniciado! Aguarde 5-10 minutos." -ForegroundColor Green
Write-Host "Acompanhe o provisionamento em /var/log/user-data.log na instância."
