param([Parameter(Mandatory)][string]$Output, [Parameter(Mandatory)][string]$PythonBase, [Parameter(Mandatory)][string]$SitePackages, [Parameter(Mandatory)][string]$CargoRegistry)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $repoRoot
try {
    node node_modules/@tauri-apps/cli/tauri.js build --no-bundle
    if ($LASTEXITCODE) { throw 'Reader build failed.' }
    Push-Location installer
    try {
        $env:CARGO_TARGET_DIR = Join-Path $repoRoot 'src-tauri/target'
        node ../node_modules/@tauri-apps/cli/tauri.js build --no-bundle
        if ($LASTEXITCODE) { throw 'Setup build failed.' }
    } finally { Pop-Location }
    python installer/scripts/package-windows.py --output $Output --python-base $PythonBase --site-packages $SitePackages
    if ($LASTEXITCODE) { throw 'Packaging failed.' }
    & (Join-Path $PSScriptRoot 'finish-windows.ps1') -Package $Output
    python installer/scripts/seal-package.py --package $Output --cargo-registry $CargoRegistry
    if ($LASTEXITCODE) { throw 'Archive creation failed.' }
} finally { Pop-Location }
