# GitHub Release 자동 업로드용 토큰 설정 (최초 1회)
# 사용법: PowerShell에서 이 스크립트 실행 → 브라우저 로그인 → 이후 deploy:app 이 토큰 사용

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.deploy'

Write-Host '=== EzPrintWork 배포 토큰 설정 ===' -ForegroundColor Cyan
Write-Host 'GitHub CLI(gh)로 로그인합니다. 브라우저가 열리면 molnanle-prog 계정으로 승인해 주세요.' -ForegroundColor Yellow

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host 'GitHub CLI(gh)가 없습니다. https://cli.github.com/ 에서 설치 후 다시 실행해 주세요.' -ForegroundColor Red
    exit 1
}

gh auth login -h github.com -p https -w

$token = gh auth token
if (-not $token) {
    Write-Host '토큰을 가져오지 못했습니다.' -ForegroundColor Red
    exit 1
}

@"
# GitHub Release 자동 업로드 (gitignore — 커밋 금지)
# 생성: scripts/setup-deploy-token.ps1
GH_TOKEN=$token
"@ | Set-Content -Path $envFile -Encoding UTF8

Write-Host "✓ .env.deploy 저장 완료: $envFile" -ForegroundColor Green
Write-Host '이제 npm run deploy:app 또는 npm run publish:release 가 자동으로 GitHub에 exe를 올립니다.' -ForegroundColor Green
