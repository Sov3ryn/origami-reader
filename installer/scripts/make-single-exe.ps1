# Turns a sealed kit ZIP into one setup program (see SingleFileSetup.cs):
#   installer/scripts/make-single-exe.ps1 -Zip <kit.zip> -Output <Origami-Reader-Setup.exe>
param([Parameter(Mandatory)][string]$Zip, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
$zipPath = (Resolve-Path -LiteralPath $Zip).Path
$outPath = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $outPath) { throw "$outPath already exists; choose a new name." }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../src-tauri/icons/icon.ico'))
$stub = "$outPath.stub"
& $compiler /nologo /target:winexe /platform:x64 "/win32icon:$icon" /r:System.Windows.Forms.dll /r:System.Drawing.dll "/r:$framework\System.IO.Compression.dll" "/r:$framework\System.IO.Compression.FileSystem.dll" "/out:$stub" (Join-Path $PSScriptRoot 'SingleFileSetup.cs')
if ($LASTEXITCODE) { throw 'The setup program did not build.' }
$out = [IO.File]::Create($outPath)
try {
    foreach ($part in $stub, $zipPath) {
        $in = [IO.File]::OpenRead($part)
        try { $in.CopyTo($out, 4MB) } finally { $in.Dispose() }
        if ($part -eq $stub) { $zipStart = $out.Position }
    }
    # Trailer: where the ZIP starts, then the marker.
    $trailer = [BitConverter]::GetBytes([long]$zipStart) + [Text.Encoding]::ASCII.GetBytes('ORIGAMI1')
    $out.Write($trailer, 0, $trailer.Length)
} finally { $out.Dispose() }
Remove-Item -LiteralPath $stub
$hash = (Get-FileHash -LiteralPath $outPath -Algorithm SHA256).Hash.ToLower()
Set-Content -LiteralPath "$outPath.sha256" -Value "$hash  $([IO.Path]::GetFileName($outPath))" -Encoding ascii
Write-Output "$outPath ($([math]::Round((Get-Item -LiteralPath $outPath).Length / 1MB)) MB, SHA-256 $hash)"
