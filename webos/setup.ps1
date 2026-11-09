# =====================================================================
#  webOS OSE dev environment setup (Windows 10/11 x64)
#  - Node.js LTS (global, for Vite/React)               -> winget
#  - Portable Node 16.20.2 + @webos-tools/cli (ares-*)  -> .\tools\node16
#  - VirtualBox 7.x                                     -> winget
#  - webOS OSE emulator image (prebuilt, qemux86-64)    -> .\tools\emulator
#  - VirtualBox VM "webos-image" (port 6622 -> ssh)
#  - npm install for .\wine-cellar-display
#  - Python 3.12 + venv + FastAPI/Uvicorn for .\backend
#
#  Run:  setup.cmd   (or)   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#  Re-running is safe: finished steps are skipped.
# =====================================================================
[CmdletBinding()]
param(
    [string]$OseVersion = "2.28.0",
    [string]$VmName = "webos-image",
    [int]$VmMemoryMB = 4096,
    [int]$VmCpus = 4,
    [switch]$SkipEmulator,
    [switch]$SkipAppInstall,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is very slow with progress bar

$Root      = $PSScriptRoot
$Tools     = Join-Path $Root "tools"
$Node16Dir = Join-Path $Tools "node16"
$EmuDir    = Join-Path $Tools "emulator"
$AppDir    = Join-Path $Root "wine-cellar-display"
$BackDir   = Join-Path $Root "backend"
$Node16Ver = "16.20.2"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}

function Has-Winget { [bool](Get-Command winget -ErrorAction SilentlyContinue) }

New-Item -ItemType Directory -Force -Path $Tools, $EmuDir | Out-Null

# ---------------------------------------------------------------------
Step "1/7  Node.js LTS (global, >= 20.19 for Vite 7)"
# ---------------------------------------------------------------------
$needNode = $true
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $v = (& node -v).TrimStart("v").Split(".")
    if ([int]$v[0] -gt 20 -or ([int]$v[0] -eq 20 -and [int]$v[1] -ge 19)) {
        Ok "node $(& node -v) found at $($nodeCmd.Source)"
        $needNode = $false
    } else {
        Warn "node $(& node -v) is too old for Vite 7"
    }
}
if ($needNode) {
    if (-not (Has-Winget)) { throw "winget not found. Install Node.js LTS manually from https://nodejs.org and re-run." }
    winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    Refresh-Path
    Ok "installed node $(& node -v)"
}

# ---------------------------------------------------------------------
Step "2/7  Portable Node $Node16Ver + webOS CLI (@webos-tools/cli)"
# ---------------------------------------------------------------------
$node16Exe = Join-Path $Node16Dir "node.exe"
if (-not (Test-Path $node16Exe)) {
    $zipName = "node-v$Node16Ver-win-x64"
    $zip = Join-Path $Tools "$zipName.zip"
    Write-Host "    downloading $zipName.zip ..."
    curl.exe -L --fail -o $zip "https://nodejs.org/dist/v$Node16Ver/$zipName.zip"
    Expand-Archive -Path $zip -DestinationPath $Tools -Force
    Move-Item (Join-Path $Tools $zipName) $Node16Dir
    Remove-Item $zip
}
Ok "portable node: $(& $node16Exe -v)"

$aresCmd = Join-Path $Node16Dir "ares.cmd"
if (-not (Test-Path $aresCmd)) {
    # --prefix keeps the CLI inside .\tools\node16 (never touches the global npm)
    & (Join-Path $Node16Dir "npm.cmd") install -g --prefix $Node16Dir "@webos-tools/cli"
    if ($LASTEXITCODE -ne 0) { throw "npm install @webos-tools/cli failed" }
}
& $aresCmd --version
& (Join-Path $Node16Dir "ares-config.cmd") --profile ose | Out-Null
Ok "ares CLI ready (profile: ose)"

if ($SkipEmulator) { Warn "skipping VirtualBox / emulator (-SkipEmulator)" }
else {
# ---------------------------------------------------------------------
Step "3/7  VirtualBox 7.x"
# ---------------------------------------------------------------------
$vbox = Join-Path $env:ProgramFiles "Oracle\VirtualBox\VBoxManage.exe"
if (-not (Test-Path $vbox)) {
    if (-not (Has-Winget)) { throw "winget not found. Install VirtualBox 7.x from https://www.virtualbox.org and re-run." }
    Warn "VirtualBox installer will ask for admin rights (UAC)."
    winget install --id Oracle.VirtualBox -e --accept-source-agreements --accept-package-agreements
    if (-not (Test-Path $vbox)) { throw "VirtualBox install did not finish. Install it manually and re-run." }
}
Ok "$(& $vbox --version)"

# ---------------------------------------------------------------------
Step "4/7  webOS OSE $OseVersion emulator image"
# ---------------------------------------------------------------------
$tag   = "v$OseVersion"
$dash  = $OseVersion.Replace(".", "-")
$tarName = "webos-ose-$dash-qemux86-64.tar.bz2"
$tarPath = Join-Path $EmuDir $tarName
$imgDir  = Join-Path $EmuDir $OseVersion

$vmdk = Get-ChildItem $imgDir -Recurse -Filter *.vmdk -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $vmdk) {
    if (-not (Test-Path $tarPath)) {
        $url = "https://github.com/webosose/build-webos/releases/download/$tag/$tarName"
        Write-Host "    downloading $url"
        Write-Host "    (large file; curl shows progress)"
        curl.exe -L --fail -C - -o $tarPath $url
        if ($LASTEXITCODE -ne 0) { throw "download failed. Check https://github.com/webosose/build-webos/releases for the asset name." }
    }
    New-Item -ItemType Directory -Force -Path $imgDir | Out-Null
    Write-Host "    extracting ..."
    tar.exe -xjf $tarPath -C $imgDir
    if ($LASTEXITCODE -ne 0) { throw "tar extraction failed" }

    # image may be shipped as .vmdk.gz inside the tarball
    $gz = Get-ChildItem $imgDir -Recurse -Filter *.vmdk.gz | Select-Object -First 1
    if ($gz) {
        Write-Host "    decompressing $($gz.Name) ..."
        $outPath = $gz.FullName.Substring(0, $gz.FullName.Length - 3)
        $in  = [IO.File]::OpenRead($gz.FullName)
        $out = [IO.File]::Create($outPath)
        $g   = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
        $g.CopyTo($out); $g.Dispose(); $out.Dispose(); $in.Dispose()
        Remove-Item $gz.FullName
    }
    $vmdk = Get-ChildItem $imgDir -Recurse -Filter *.vmdk | Select-Object -First 1
    if (-not $vmdk) { throw "no .vmdk found after extraction. Contents: $(Get-ChildItem $imgDir -Recurse | Select-Object -Expand Name)" }
}
Ok "image: $($vmdk.FullName)"

# ---------------------------------------------------------------------
Step "5/7  VirtualBox VM '$VmName'"
# ---------------------------------------------------------------------
$exists = (& $vbox list vms) -match "^`"$([regex]::Escape($VmName))`""
if ($exists) {
    Ok "VM already exists (delete it in VirtualBox to recreate)"
} else {
    & $vbox createvm --name $VmName --ostype Linux_64 --register
    & $vbox modifyvm $VmName `
        --memory $VmMemoryMB --cpus $VmCpus --ioapic on `
        --vram 128 --graphicscontroller vmsvga --accelerate3d on `
        --boot1 disk --boot2 none --boot3 none --boot4 none `
        --usbohci on --mouse usbtablet `
        --audio-driver dsound --audio-enabled on `
        --nic1 nat --nictype1 82540EM `
        --natpf1 "ssh,tcp,,6622,,22" `
        --natpf1 "web-inspector,tcp,,9998,,9998" `
        --natpf1 "enact-browser-web-inspector,tcp,,9223,,9223"
    & $vbox storagectl $VmName --name "IDE" --add ide
    & $vbox storageattach $VmName --storagectl "IDE" --port 0 --device 0 --type hdd --medium $vmdk.FullName
    Ok "VM created"
}
}

# ---------------------------------------------------------------------
Step "6/7  App dependencies (wine-cellar-display)"
# ---------------------------------------------------------------------
if ($SkipAppInstall) { Warn "skipped (-SkipAppInstall)" }
elseif (Test-Path (Join-Path $AppDir "node_modules")) { Ok "node_modules already present" }
else {
    Push-Location $AppDir
    npm install
    Pop-Location
    Ok "npm install done"
}

# ---------------------------------------------------------------------
Step "7/7  Python backend (FastAPI + Uvicorn in backend\.venv)"
# ---------------------------------------------------------------------
if ($SkipBackend) { Warn "skipped (-SkipBackend)" }
else {
    function Find-Python {
        # returns @(exe, args...) for a Python >= 3.10, or $null
        foreach ($cand in @(@("py", "-3"), @("python"))) {
            $exe = $cand[0]
            $pre = @($cand | Select-Object -Skip 1)
            if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
            try {
                $v = & $exe @pre --version 2>$null
                if ($LASTEXITCODE -eq 0 -and "$v" -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) { return ,$cand }
            } catch {}
        }
        return $null
    }
    $py = Find-Python
    if (-not $py) {
        if (-not (Has-Winget)) { throw "Python 3.10+ not found. Install it from https://www.python.org and re-run." }
        winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
        Refresh-Path
        $py = Find-Python
        if (-not $py) { throw "Python install finished but python is not on PATH yet. Open a new terminal and re-run setup." }
    }
    $pyExe = $py[0]
    $pyPre = @($py | Select-Object -Skip 1)
    Ok "using: $(& $pyExe @pyPre --version)"
    $venvPy = Join-Path $BackDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPy)) {
        & $pyExe @pyPre -m venv (Join-Path $BackDir ".venv")
    }
    & $venvPy -m pip install --upgrade pip -q
    & $venvPy -m pip install -r (Join-Path $BackDir "requirements.txt") -q
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
    $envFile = Join-Path $BackDir ".env"
    if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $BackDir ".env.example") $envFile; Ok "created backend\.env (LLM_PROVIDER=mock)" }
    Ok "backend ready"
}

Write-Host ""
Write-Host "============================== DONE ==============================" -ForegroundColor Green
Write-Host " Start emulator : `"$env:ProgramFiles\Oracle\VirtualBox\VBoxManage.exe`" startvm $VmName"
Write-Host "                  (or VirtualBox GUI -> $VmName -> Start; boot takes ~1 min)"
Write-Host " ares in shell  : . .\webos-env.ps1   then   ares-setup-device --list"
Write-Host " Backend        : run-backend.cmd   (http://localhost:8000/docs)"
Write-Host " Browser dev    : run-display.cmd   (http://localhost:5173)"
Write-Host " Deploy to emu  : cd wine-cellar-display; npm run webos:deploy"
Write-Host "=================================================================="
