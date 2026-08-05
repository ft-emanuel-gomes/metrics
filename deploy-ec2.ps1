$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Script compatível com Amazon Linux 2 (yum)
$userData = @'
#!/bin/bash
exec > /var/log/user-data.log 2>&1
set -ex

# Instalar Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# Clonar repositório
cd /home/ec2-user
git clone https://github.com/ft-emanuel-gomes/metrics.git
cd metrics
git checkout feat/sprint-2-improvements

# Criar .env
cat > .env << 'ENVEOF'
JIRA_BASE_URL=https://montebravo.atlassian.net
JIRA_EMAIL=YOUR_JIRA_EMAIL
JIRA_API_TOKEN=YOUR_JIRA_API_TOKEN
S3_BUCKET=monte-bravo-metrics-data
S3_REGION=us-east-1
S3_ACCESS_KEY=YOUR_AWS_ACCESS_KEY
S3_SECRET_KEY=YOUR_AWS_SECRET_KEY
JWT_SECRET=YOUR_JWT_SECRET
JWT_EXPIRES_IN=30d
ATLASSIAN_CLIENT_ID=YOUR_ATLASSIAN_CLIENT_ID
ATLASSIAN_CLIENT_SECRET=YOUR_ATLASSIAN_CLIENT_SECRET
ATLASSIAN_REDIRECT_URI=https://d3ous1nh7xo4k4.cloudfront.net/api/auth/callback
USE_DATABASE_METRICS=false
NODE_TLS_REJECT_UNAUTHORIZED=0
PORT=3000
ENVEOF

# Instalar dependências e buildar
export NODE_TLS_REJECT_UNAUTHORIZED=0
npm install --legacy-peer-deps
npm run build

# Instalar PM2 e rodar
npm install -g pm2
pm2 start npm --name metrics -- start
pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Redirecionar porta 80 -> 3000
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 3000

echo "DEPLOY COMPLETE" >> /var/log/user-data.log
'@

$userDataBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($userData))

& $aws ec2 run-instances `
  --image-id ami-0c02fb55956c7d316 `
  --instance-type t2.small `
  --key-name metrics-key `
  --security-group-ids sg-070dd9d8043415864 `
  --count 1 `
  --region us-east-1 `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=metrics-app}]' `
  --user-data $userDataBase64 `
  --query 'Instances[0].{InstanceId:InstanceId,State:State.Name}' `
  --output table

Write-Host "`nDeploy iniciado! Aguarde 5-10 minutos."
