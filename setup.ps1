# AccountingHR - Full Cloud Setup Script
# Run this in PowerShell after logging into Supabase CLI

param(
  [string]$SupabaseToken = "",
  [string]$VercelToken = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AccountingHR - Cloud Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $SupabaseToken) {
  $SupabaseToken = Read-Host "Paste your Supabase Personal Access Token (create at supabase.com > Settings > API > Access Tokens)"
}

# 1. Create Supabase project
Write-Host "`n[1/6] Creating Supabase project..." -ForegroundColor Yellow
$headers = @{
  "Authorization" = "Bearer $SupabaseToken"
  "Content-Type" = "application/json"
}
$orgs = Invoke-RestMethod -Uri "https://api.supabase.com/v1/organizations" -Headers $headers -Method Get
$orgId = $orgs[0].id

$body = @{
  name = "accounting-hr"
  organization_id = $orgId
  plan = "free"
  region = "us-east-1"
  db_pass = [System.Web.Security.Membership]::GeneratePassword(16, 2)
} | ConvertTo-Json

$project = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects" -Headers $headers -Method Post -Body $body
$projectId = $project.id
$dbPassword = $body.db_pass
Write-Host "  Project created! ID: $projectId" -ForegroundColor Green
Write-Host "  DB Password: $dbPassword (SAVE THIS!)" -ForegroundColor Green

# 2. Wait for project to be ready
Write-Host "`n[2/6] Waiting for project to initialize (60s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# 3. Get project API credentials
Write-Host "`n[3/6] Fetching API credentials..." -ForegroundColor Yellow
$apiSettings = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectId/api-settings" -Headers $headers
$anonKey = $apiSettings.anon_key
$projectUrl = "https://$projectId.supabase.co"
Write-Host "  URL: $projectUrl" -ForegroundColor Green
Write-Host "  Anon Key: $anonKey" -ForegroundColor Green

# 4. Run the migration SQL via the SQL API
Write-Host "`n[4/6] Running database migration..." -ForegroundColor Yellow
$migrationSql = Get-Content -Path "$PSScriptRoot\supabase-migration.sql" -Raw
$sqlBody = @{ query = $migrationSql } | ConvertTo-Json
$sqlHeaders = @{
  "apikey" = $anonKey
  "Authorization" = "Bearer $anonKey"
  "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "$projectUrl/rest/v1/rpc/pgrest_run_sql" -Headers $sqlHeaders -Method Post -Body $sqlBody -ErrorAction SilentlyContinue
# Fallback: Use management API SQL endpoint
$mgmtSqlBody = @{ query = $migrationSql } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectId/sql" -Headers $headers -Method Post -Body $mgmtSqlBody
Write-Host "  Migration complete!" -ForegroundColor Green

# 5. Create storage bucket
Write-Host "`n[5/6] Creating storage bucket..." -ForegroundColor Yellow
$bucketBody = @{
  name = "company-files"
  public = $true
} | ConvertTo-Json
$bucketHeaders = @{
  "Authorization" = "Bearer $SupabaseToken"
  "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectId/buckets" -Headers $bucketHeaders -Method Post -Body $bucketBody
Write-Host "  Storage bucket created!" -ForegroundColor Green

# 6. Create AEGIS auth user
Write-Host "`n[6/6] Creating AEGIS admin user..." -ForegroundColor Yellow
$authUserBody = @{
  email = "aegis@master.admin"
  password = "123456"
  email_confirm = $true
} | ConvertTo-Json
$authHeaders = @{
  "apikey" = $anonKey
  "Authorization" = "Bearer $anonKey"
  "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "$projectUrl/auth/v1/admin/users" -Headers $authHeaders -Method Post -Body $authUserBody -ErrorAction SilentlyContinue
Write-Host "  AEGIS user created!" -ForegroundColor Green

# Write .env file
$envContent = @"
VITE_SUPABASE_URL=$projectUrl
VITE_SUPABASE_ANON_KEY=$anonKey
"@
Set-Content -Path "$PSScriptRoot\.env" -Value $envContent
Write-Host "`n  .env file written!" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Supabase setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: Deploy to Vercel"
Write-Host "  1. Run: npx vercel login"
Write-Host "     (opens browser - log in with GitHub/Google)"
Write-Host "  2. Run: npx vercel --prod"
Write-Host "     (paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY when prompted)"
Write-Host ""
Write-Host "Or for quick deploy with a token:"
Write-Host "  1. Go to vercel.com > Settings > Tokens > Create"
Write-Host "  2. Run this script with: .\setup.ps1 -VercelToken your_token"
Write-Host ""

if ($VercelToken) {
  Write-Host "Deploying to Vercel..." -ForegroundColor Yellow
  $envVars = "VITE_SUPABASE_URL=$projectUrl VITE_SUPABASE_ANON_KEY=$anonKey"
  $process = Start-Process -NoNewWindow -Wait -PassThru -FilePath "npx" -ArgumentList "vercel", "--prod", "--token", $VercelToken, "--yes", "--env", $envVars
  Write-Host "  Vercel deploy initiated!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Your app URL and credentials:" -ForegroundColor Cyan
Write-Host "  AEGIS login: username='AEGIS' password='123456'" -ForegroundColor White
Write-Host "  DB Password: $dbPassword" -ForegroundColor White
Write-Host ""
