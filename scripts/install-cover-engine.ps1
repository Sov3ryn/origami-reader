param([string]$Directory = (Join-Path $env:APPDATA 'app.origami.reader/cover-engine'), [string]$Config = (Join-Path $env:APPDATA 'app.origami.reader/cover-engine.json'))
$ErrorActionPreference = 'Stop'
$taskEngine = [IO.Path]::GetFullPath($Directory)
New-Item -ItemType Directory -Force -Path $taskEngine | Out-Null
$taskRuntime = Join-Path $taskEngine 'runtime'
$taskArchive = Join-Path $taskEngine 'runtime.zip'
$taskTag = 'master-959-d637cfb'
if (-not (Test-Path -LiteralPath (Join-Path $taskRuntime 'sd-cli.exe'))) {
  Write-Output 'Downloading the native Vulkan cover runtime...'
  Invoke-WebRequest -Uri ("https://github.com/leejet/stable-diffusion.cpp/releases/download/$taskTag/sd-master-d637cfb-bin-win-vulkan-x64.zip") -OutFile $taskArchive
  Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskRuntime -Force
}
$taskConfigPath = [IO.Path]::GetFullPath($Config)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskConfigPath) | Out-Null
if (-not (Test-Path -LiteralPath $taskConfigPath)) {
  $taskImageConfig = @{ executable = (Join-Path $taskRuntime 'sd-cli.exe'); model = ''; backend = 'vulkan0' }
  [IO.File]::WriteAllText($taskConfigPath, ($taskImageConfig | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}
& (Join-Path $PSScriptRoot 'install-portrait-engine.ps1') -Config $taskConfigPath
if (-not $?) { throw 'Image model setup failed. Existing downloads are retained for retry.' }
Write-Output 'DreamShaper is configured for book covers and voice portraits. Reopen Origami.'
