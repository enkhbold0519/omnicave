# Dot-source in a PowerShell session to use ares-* commands:
#     . .\webos-env.ps1
# The ares CLI runs on the portable Node 16 in .\tools\node16,
# while `node` / `npm` stay on your global Node (for Vite).
$script:WebosNode16 = Join-Path $PSScriptRoot "tools\node16"
if (-not (Test-Path (Join-Path $WebosNode16 "ares.cmd"))) {
    Write-Warning "ares CLI not found. Run setup.cmd first."
    return
}
$cmds = "ares","ares-config","ares-setup-device","ares-generate","ares-package",
        "ares-install","ares-launch","ares-inspect","ares-device","ares-shell",
        "ares-push","ares-pull","ares-log","ares-server","ares-novacom"
foreach ($c in $cmds) {
    $shim = Join-Path $WebosNode16 "$c.cmd"
    if (Test-Path $shim) {
        Set-Item -Path "function:global:$c" -Value ([ScriptBlock]::Create("& '$shim' @args"))
    }
}
Write-Host "webOS CLI loaded (node16: $WebosNode16). Try: ares-setup-device --list" -ForegroundColor Green
