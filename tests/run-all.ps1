# Runs every test layer with nothing skipped. Usage: .\tests\run-all.ps1 [-JavaHome <JDK dir>]
param([string]$JavaHome = $(if ($env:FOP_JAVA_HOME) { $env:FOP_JAVA_HOME } else { $env:JAVA_HOME }))

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$bundled = Join-Path $root 'assets\bundled'
$fopDir = if ($env:FOP_DIR) { $env:FOP_DIR } else { Join-Path $bundled 'fop' }
$gson = if ($env:GSON_JAR) { $env:GSON_JAR } else { Join-Path $bundled 'fop\server\gson-2.10.1.jar' }

$missing = @()
if (-not ((Test-Path "$fopDir\build") -and (Test-Path "$fopDir\lib"))) { $missing += "FOP (build/ and lib/) not found in $fopDir - see README or set FOP_DIR" }
if (-not (Test-Path $gson)) { $missing += "gson jar not found at $gson - see README or set GSON_JAR" }
if (-not ($JavaHome -and (Test-Path "$JavaHome\bin\javac.exe"))) { $missing += "JDK with javac required - pass -JavaHome or set JAVA_HOME / FOP_JAVA_HOME" }
if ($missing) { $missing | ForEach-Object { Write-Error $_ -ErrorAction Continue }; exit 1 }

$env:FOP_JAVA_HOME = $JavaHome

npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:e2e
exit $LASTEXITCODE
