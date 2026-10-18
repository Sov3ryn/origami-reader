$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$receiptPath = Join-Path $installRoot 'installation.json'
if (!(Test-Path -LiteralPath $receiptPath)) { throw 'Installation receipt is missing.' }
# Receipts are UTF-8 without a byte order mark, which Windows PowerShell 5.1
# would otherwise read as ANSI (a folder under a non-English user name).
$receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([IO.Path]::GetFullPath($receipt.root) -ne $installRoot) { throw 'Installation receipt does not match this folder.' }
Add-Type -AssemblyName System.Windows.Forms
$choice = [Windows.Forms.MessageBox]::Show('Remove Origami, its installed voices and models? Your library, notes and reading settings will be kept. Close Origami first.', 'Uninstall Origami', 'YesNo', 'Question')
if ($choice -ne 'Yes') { exit }
$prefix = $installRoot.TrimEnd('\') + '\'
foreach ($relative in $receipt.files) {
    $target = [IO.Path]::GetFullPath((Join-Path $installRoot $relative))
    if (!$target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid file path in installation receipt.' }
}
foreach ($relative in $receipt.files) {
    $target = [IO.Path]::GetFullPath((Join-Path $installRoot $relative))
    if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
}
$configRoot = Join-Path $env:APPDATA 'app.origami.reader'
$marker = Join-Path $configRoot 'installation.json'
if (Test-Path -LiteralPath $marker) {
    $installed = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
    # Same folder (letter case and a trailing backslash do not matter), or a
    # folder that no longer exists: the settings belong to no other install.
    $recorded = [IO.Path]::GetFullPath([string]$installed.root).TrimEnd('\')
    if ([string]::Equals($recorded, $installRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath (Join-Path $recorded 'origami-reader.exe'))) {
        foreach ($name in @('worker.json', 'cover-engine.json', 'voice-design.json', 'installation.json')) {
            $target = Join-Path $configRoot $name
            if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
        }
    }
}
$shell = New-Object -ComObject WScript.Shell
foreach ($link in $receipt.shortcuts) {
    if ((Test-Path -LiteralPath $link) -and $link.EndsWith('.lnk') -and $shell.CreateShortcut($link).TargetPath -eq (Join-Path $installRoot 'origami-reader.exe')) {
        Remove-Item -LiteralPath $link
    }
}
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OrigamiReaderBeta'
if ((Test-Path -LiteralPath $key) -and (Get-ItemProperty -LiteralPath $key).InstallLocation -eq $installRoot) { Remove-Item -LiteralPath $key }
Remove-Item -LiteralPath $receiptPath
# Only remove empty directories beneath the verified installation root.
Get-ChildItem -LiteralPath $installRoot -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    if ($_.FullName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and !(Get-ChildItem -LiteralPath $_.FullName -Force)) { Remove-Item -LiteralPath $_.FullName }
}
if (!(Get-ChildItem -LiteralPath $installRoot -Force)) { Remove-Item -LiteralPath $installRoot }
# Setup's download cache (finished downloads kept for a retry), never the reader's files.
if ($env:LOCALAPPDATA) {
    $downloads = Join-Path $env:LOCALAPPDATA 'Origami Setup Downloads'
    if (Test-Path -LiteralPath $downloads) { Remove-Item -LiteralPath $downloads -Recurse -Force -ErrorAction SilentlyContinue }
}
[Windows.Forms.MessageBox]::Show('Origami has been removed. Your library and reading settings were kept.', 'Origami') | Out-Null
