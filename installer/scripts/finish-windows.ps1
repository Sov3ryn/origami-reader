param([Parameter(Mandatory)][string]$Package)
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $Package).Path
$dependencies = Join-Path $packageRoot 'prerequisites'
New-Item -ItemType Directory -Force -Path $dependencies | Out-Null
$downloads = @{
    'VC_redist.x64.exe' = 'https://aka.ms/vc14/vc_redist.x64.exe'
    'MicrosoftEdgeWebView2RuntimeInstallerX64.exe' = 'https://go.microsoft.com/fwlink/?linkid=2124701'
}
foreach ($name in $downloads.Keys) {
    $target = Join-Path $dependencies $name
    if (!(Test-Path -LiteralPath $target)) { Invoke-WebRequest -Uri $downloads[$name] -OutFile $target }
    $signature = Get-AuthenticodeSignature -LiteralPath $target
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
        throw "Microsoft signature could not be verified for $name"
    }
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src-tauri/icons/icon.ico'))
& $compiler /nologo /target:winexe /platform:x64 /r:System.Windows.Forms.dll "/win32icon:$icon" "/out:$packageRoot/Origami Reader Installer.exe" (Join-Path $PSScriptRoot 'SetupLauncher.cs')
if ($LASTEXITCODE) { throw 'Dependency launcher build failed.' }
Write-Output "Windows package prepared at $packageRoot"
