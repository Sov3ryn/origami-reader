param([string]$Directory = (Join-Path $env:APPDATA 'app.origami.reader/cover-engine'))
$ErrorActionPreference = 'Stop'
$taskEngine = [IO.Path]::GetFullPath($Directory)
New-Item -ItemType Directory -Force -Path $taskEngine | Out-Null
$taskRuntime = Join-Path $taskEngine 'runtime'
$taskModel = Join-Path $taskEngine 'sd-turbo-f16.gguf'
$taskSource = Join-Path $taskEngine 'sd_turbo.source.safetensors'
$taskArchive = Join-Path $taskEngine 'runtime.zip'
$taskTag = 'master-959-d637cfb'
if (-not (Test-Path -LiteralPath (Join-Path $taskRuntime 'sd-cli.exe'))) {
  Write-Output 'Downloading the native Vulkan cover runtime...'
  Invoke-WebRequest -Uri ("https://github.com/leejet/stable-diffusion.cpp/releases/download/$taskTag/sd-master-d637cfb-bin-win-vulkan-x64.zip") -OutFile $taskArchive
  Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskRuntime -Force
}
if (-not (Test-Path -LiteralPath $taskModel)) {
  Write-Output 'Downloading SD-Turbo, about 5.2 GB. About 8 GB of free space is needed during setup.'
  if (-not (Test-Path -LiteralPath $taskSource)) {
    Invoke-WebRequest -Uri 'https://huggingface.co/stabilityai/sd-turbo/resolve/main/sd_turbo.safetensors' -OutFile $taskSource
  }
  Write-Output 'Converting to the tested half-precision model, about 2.7 GB...'
  $taskPendingModel = Join-Path $taskEngine 'sd-turbo.pending.gguf'
  & (Join-Path $taskRuntime 'sd-cli.exe') -M convert -m $taskSource -o $taskPendingModel --type f16 --log-level error
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $taskPendingModel)) { throw 'Model conversion failed. The download has been kept for retry.' }
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($taskModel)) -ne $taskEngine) { throw 'Unexpected converted model path' }
  Move-Item -LiteralPath $taskPendingModel -Destination $taskModel
  # Only remove the source file created by this setup, after checking its parent.
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($taskSource)) -ne $taskEngine) { throw 'Unexpected download cleanup path' }
  Remove-Item -LiteralPath $taskSource
}
Invoke-WebRequest -Uri 'https://huggingface.co/stabilityai/sd-turbo/raw/main/LICENSE.md' -OutFile (Join-Path $taskEngine 'SD-Turbo-LICENSE.txt')
$taskConfigDirectory = Join-Path $env:APPDATA 'app.origami.reader'
New-Item -ItemType Directory -Force -Path $taskConfigDirectory | Out-Null
$taskConfig = @{ executable = (Join-Path $taskRuntime 'sd-cli.exe'); model = $taskModel; backend = 'vulkan0' } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $taskConfigDirectory 'cover-engine.json'), $taskConfig, [Text.UTF8Encoding]::new($false))
Write-Output 'Cover engine installed. Reopen Origami. Powered by Stability AI.'
