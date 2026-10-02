# 🍡 Mochi — 1-Click Automated Uninstaller for Windows
$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "===================================================" -ForegroundColor Magenta
Write-Host "         🍡 MOCHI 1-CLICK UNINSTALLER              " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Magenta
Write-Host ""

# 1. Close running Mochi processes
Write-Host "[1/4] Stopping Mochi processes..." -ForegroundColor Yellow
Get-Process electron -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*Mochi-Eye*" -or $_.CommandLine -like "*Mochi*"
} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "      ✓ Stopped running processes" -ForegroundColor Green

# 2. Remove Desktop Shortcut
Write-Host "[2/4] Removing Desktop shortcut..." -ForegroundColor Yellow
$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$shortcutPath = Join-Path $desktopPath "Mochi Eye.lnk"
if (Test-Path $shortcutPath) {
    Remove-Item -Force $shortcutPath -ErrorAction SilentlyContinue
}
Write-Host "      ✓ Desktop shortcut removed" -ForegroundColor Green

# 3. Clean up Windows Startup (Shortcut & Registry)
Write-Host "[3/4] Removing from Windows Startup..." -ForegroundColor Yellow
$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
$startupLnk = Join-Path $startupFolder "Mochi.lnk"
$legacyVbs = Join-Path $startupFolder "CoucouCreator.vbs"
if (Test-Path $startupLnk) { Remove-Item -Force $startupLnk -ErrorAction SilentlyContinue }
if (Test-Path $legacyVbs) { Remove-Item -Force $legacyVbs -ErrorAction SilentlyContinue }

Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "CoucouCreator" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Mochi" -ErrorAction SilentlyContinue
Write-Host "      ✓ Startup entries removed" -ForegroundColor Green

# 4. Remove Mochi Folder & Cache
Write-Host "[4/4] Removing Mochi files and data..." -ForegroundColor Yellow
$installFolder = "$env:USERPROFILE\Mochi-Eye"
if (Test-Path $installFolder) {
    Remove-Item -Recurse -Force $installFolder -ErrorAction SilentlyContinue
}
$appDataRoaming = Join-Path $env:APPDATA "mochi-eye"
if (Test-Path $appDataRoaming) {
    Remove-Item -Recurse -Force $appDataRoaming -ErrorAction SilentlyContinue
}
Write-Host "      ✓ Mochi files and cache cleaned" -ForegroundColor Green

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "   🎉 SUCCESS: Mochi has been completely removed!  " -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""
