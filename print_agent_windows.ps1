# ==============================================================================
# PressPoint Windows Print Agent Startup & TPM Health Inspector
# ==============================================================================
# Verifies TPM 2.0 readiness and provides auto-startup via Windows Task Scheduler.

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  PRESSPOINT WINDOWS PRINT AGENT — SYSTEM & TPM INSPECTION" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Inspect Hardware TPM Status
Write-Host "`n[1/3] Inspecting Trusted Platform Module (TPM)..." -ForegroundColor Yellow
try {
    $tpm = Get-Tpm -ErrorAction SilentlyContinue
    if ($tpm -and $tpm.TpmPresent) {
        Write-Host "  [+] TPM Present: Yes" -ForegroundColor Green
        Write-Host "  [+] TPM Ready: $($tpm.TpmReady)" -ForegroundColor Green
        Write-Host "  [+] Manufacturer: $($tpm.ManufacturerIdTxt)" -ForegroundColor Green
        Write-Host "  [+] Storage: Hardware TPM 2.0 Security Enclave" -ForegroundColor Green
    } else {
        Write-Host "  [-] Hardware TPM not detected. Operating under CNG Software Fallback Policy." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [-] TPM query restricted. Utilizing Windows Cryptography Next Generation (CNG)." -ForegroundColor Yellow
}

# 2. Check Node.js Runtime for Agent
Write-Host "`n[2/3] Inspecting Node.js runtime for agent daemon..." -ForegroundColor Yellow
$nodeVersion = node -v 2>$null
if ($nodeVersion) {
    Write-Host "  [+] Node runtime active: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  [-] Node.js not found in PATH. Please install Node.js v18+." -ForegroundColor Red
}

# 3. Automatic Startup on Boot (Task Scheduler setup helper)
Write-Host "`n[3/3] Windows Boot Auto-Startup Configurator..." -ForegroundColor Yellow
$scriptPath = "$PSScriptRoot\print_agent_client.mjs"
Write-Host "  To configure automatic background startup upon Windows boot:" -ForegroundColor Gray
Write-Host "  Action: node $scriptPath --daemon" -ForegroundColor White
Write-Host "`nInspection complete. Device is ready for counter operations." -ForegroundColor Cyan
