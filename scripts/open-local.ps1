$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskBinary = Join-Path $taskProject 'src-tauri/target/release/origami-reader.exe'
if (-not (Test-Path -LiteralPath $taskBinary)) { throw 'Build the desktop app first: npm run tauri build -- --no-bundle' }
$taskWorker = Join-Path $taskProject '.local/worker.json'
if (Test-Path -LiteralPath $taskWorker) { $env:ORIGAMI_WORKER_CONFIG = $taskWorker }
$taskCover = Join-Path $taskProject '.local/cover-engine.json'
if (Test-Path -LiteralPath $taskCover) { $env:ORIGAMI_COVER_CONFIG = $taskCover }
Start-Process -FilePath $taskBinary -WorkingDirectory $taskProject -WindowStyle Hidden
