param([string]$TargetDir = "src-tauri\target\release")

$src = Join-Path $PSScriptRoot "ModsDescription.json"
$dst = Join-Path $PSScriptRoot "$TargetDir\ModsDescription.json"

if (Test-Path $src) {
    Copy-Item $src $dst -Force
    Write-Output "Copied ModsDescription.json -> $TargetDir"
} else {
    Write-Output "ModsDescription.json not found at $src"
}
