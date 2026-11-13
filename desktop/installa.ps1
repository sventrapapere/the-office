# The Office - installazione / aggiornamento dell'app desktop
# Lancialo con doppio clic su "Installa The Office.cmd" (nella stessa cartella).
# La prima volta installa gli strumenti per compilare (Visual Studio Build Tools + Rust,
# circa 2-3 GB, chiede l'autorizzazione di amministratore) e ci mette 5-10 minuti.
# Le volte successive ricompila solo le modifiche (meno di un minuto).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { $Host.UI.RawUI.WindowTitle = 'The Office - installazione' } catch {}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$src    = Split-Path -Parent $MyInvocation.MyCommand.Path          # ...\_dashboard\app
$vault  = Split-Path -Parent (Split-Path -Parent $src)              # ...\GONDISHAPUR
$build  = Join-Path $env:LOCALAPPDATA 'TheOffice\build'             # fuori da Google Drive
$dest   = Join-Path $env:LOCALAPPDATA 'Programs\TheOffice'
$cfgDir = Join-Path $env:APPDATA 'TheOffice'
$exe    = Join-Path $dest 'TheOffice.exe'
$lnk    = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\The Office.lnk'
$utf8   = New-Object System.Text.UTF8Encoding($false)

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Fail($t) { Write-Host ''; Write-Host $t -ForegroundColor Red; Read-Host 'Premi Invio per chiudere'; exit 1 }

Write-Host 'The Office - installazione' -ForegroundColor Green
Write-Host "Vault:     $vault"
Write-Host "Sorgenti:  $src"
if (-not (Test-Path -LiteralPath (Join-Path $vault '.obsidian'))) { Fail "Non trovo il vault Obsidian in $vault" }

# 1. Compilatore C++ di Microsoft (serve a Rust per creare .exe Windows)
Step 'Visual Studio Build Tools (compilatore C++)'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
function Has-MSVC {
  if (-not (Test-Path -LiteralPath $vswhere)) { return $false }
  $p = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  return [bool]$p
}
if (Has-MSVC) {
  Write-Host 'Gia installati.'
} else {
  Write-Host 'Li scarico e li installo (circa 2 GB). Windows chiedera'' l''autorizzazione: rispondi Si''.'
  $vs = Join-Path $env:TEMP 'vs_BuildTools.exe'
  Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile $vs -UseBasicParsing
  $p = Start-Process -FilePath $vs -Verb RunAs -Wait -PassThru -ArgumentList @(
    '--wait', '--passive', '--norestart',
    '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--includeRecommended')
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fail "Installazione Build Tools non riuscita (codice $($p.ExitCode))." }
  if (-not (Has-MSVC)) { Fail 'Build Tools installati ma il compilatore C++ non risulta. Riavvia il PC e rilancia lo script.' }
}

# 2. Rust
Step 'Rust'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if ($env:Path -notlike "*$cargoBin*") { $env:Path = "$cargoBin;$env:Path" }
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if ($cargo) {
  Write-Host 'Gia installato.'
} else {
  Write-Host 'Lo scarico e lo installo...'
  $ri = Join-Path $env:TEMP 'rustup-init.exe'
  Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $ri -UseBasicParsing
  & $ri -y --default-toolchain stable --profile minimal
  if ($LASTEXITCODE -ne 0) { Fail 'Installazione di Rust non riuscita.' }
  $cargo = Get-Command cargo -ErrorAction SilentlyContinue
  if (-not $cargo) { Fail 'Rust installato ma cargo non si trova. Chiudi questa finestra e rilancia lo script.' }
}

# 3. Compilazione (i file temporanei vanno in AppData, non nel vault su Google Drive)
Step 'Compilo The Office (la prima volta 5-10 minuti, poi molto meno)'
$env:CARGO_TARGET_DIR = $build
$ErrorActionPreference = 'Continue'
& cargo build --release --manifest-path (Join-Path $src 'Cargo.toml')
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { Fail 'Compilazione non riuscita: copia gli errori qui sopra e mandali a Claude.' }

# 4. Installazione
Step 'Installo'
Get-Process -Name TheOffice -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600
New-Item -ItemType Directory -Force -Path $dest, $cfgDir | Out-Null
Copy-Item -LiteralPath (Join-Path $build 'release\TheOffice.exe') -Destination $exe -Force
[IO.File]::WriteAllText((Join-Path $cfgDir 'config.json'), (@{ vault = $vault } | ConvertTo-Json), $utf8)

$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $exe
$s.WorkingDirectory = $dest
$s.Description = 'The Office - dashboard personale'
$s.IconLocation = "$exe,0"
$s.Save()

Write-Host ''
Write-Host 'Fatto!' -ForegroundColor Green
Write-Host "App:        $exe"
Write-Host 'Menu Start: "The Office" (tasto destro > Aggiungi a Start / Aggiungi alla barra delle applicazioni)'
Write-Host "Log:        $(Join-Path $cfgDir 'the-office.log')"
Start-Process -FilePath $exe
Start-Sleep -Seconds 2
