# Arranca sidecar enriquecimiento NIT (loopback 18765)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$py = $null
foreach ($c in @("py", "python", "python3")) {
  try {
    $v = & $c --version 2>$null
    if ($LASTEXITCODE -eq 0 -or $v) {
      # Evitar stub Microsoft Store
      $cmd = Get-Command $c -ErrorAction SilentlyContinue
      if ($cmd -and $cmd.Source -match "WindowsApps") { continue }
      $py = $c
      break
    }
  } catch {}
}
if (-not $py) {
  $local = Join-Path $env:LOCALAPPDATA "Python\bin\python.exe"
  if (Test-Path $local) { $py = $local }
}
if (-not $py) {
  Write-Host "Python no encontrado. Instala Python 3.10+." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".venv")) {
  Write-Host "Creando venv..."
  & $py -m venv .venv
}
$venvPy = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { $venvPy = Join-Path $Root ".venv/bin/python" }

& $venvPy -m pip install -q -r requirements.txt

$obscuraOn = $env:CROZZO_OBSCURA
if (-not $obscuraOn) { $env:CROZZO_OBSCURA = "0" }
$binOk = Test-Path (Join-Path $Root "bin\obscura.exe")
Write-Host "Sidecar http://127.0.0.1:18765  CROZZO_OBSCURA=$($env:CROZZO_OBSCURA) bin=$binOk  (Ctrl+C para parar)"
& $venvPy server.py
