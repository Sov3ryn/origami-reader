param([string]$Config = (Join-Path $env:APPDATA 'app.origami.reader/cover-engine.json'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Config)) { throw 'Set up the cover engine first, then run this portrait setup.' }
$taskConfigPath = (Resolve-Path -LiteralPath $Config).Path
$taskImageConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json
$taskDirectory = Join-Path (Split-Path -Parent $taskConfigPath) 'portrait-engine'
New-Item -ItemType Directory -Force -Path $taskDirectory | Out-Null
$taskModel = Join-Path $taskDirectory 'dreamshaper-8-lcm.safetensors'
$taskHash = 'A4F3E1526C5DC4FCBE342F5C410D83AE202C7A415FCEFCBB92E0F93FCD0A87C3'
if (-not (Test-Path -LiteralPath $taskModel)) {
  Write-Output "Downloading DreamShaper 8 LCM, about 2.1 GB, from the author's public release..."
  Invoke-WebRequest -Uri 'https://civitai.com/api/download/models/252914?fileId=196006' -OutFile $taskModel
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $taskModel).Hash -ne $taskHash) { throw 'Portrait model checksum mismatch. The file is retained for inspection and is not activated.' }
$taskLicense = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/licenses/DreamShaper-OpenRAIL-M.txt'
Copy-Item -LiteralPath $taskLicense -Destination (Join-Path $taskDirectory 'CreativeML-OpenRAIL-M.txt')
$taskReadme = @'
DreamShaper 8 LCM by Lykon. Base: Stable Diffusion 1.5.
https://huggingface.co/Lykon/dreamshaper-8-lcm
Author's release: https://civitai.com/models/4384?modelVersionId=252914
CreativeML OpenRAIL-M model terms apply separately from Origami's MPL 2.0 source license.
Source SHA-256: A4F3E1526C5DC4FCBE342F5C410D83AE202C7A415FCEFCBB92E0F93FCD0A87C3
The author's model-page permissions allow image use and do not permit selling the model itself.
'@
[IO.File]::WriteAllText((Join-Path $taskDirectory 'MODEL-NOTICE.txt'), $taskReadme, [Text.UTF8Encoding]::new($false))
$taskPortrait = @{ model = $taskModel; profile = 'dreamshaper-8-lcm' }
$taskImageConfig | Add-Member -NotePropertyName portrait -NotePropertyValue $taskPortrait -Force
# Keep a recoverable copy of the existing image-engine configuration.
Copy-Item -LiteralPath $taskConfigPath -Destination ($taskConfigPath + '.before-portraits.json')
[IO.File]::WriteAllText($taskConfigPath, ($taskImageConfig | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Output 'DreamShaper portraits installed. Book covers keep their existing model. Reopen Origami.'
