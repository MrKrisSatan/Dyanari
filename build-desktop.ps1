param([string]$Dotnet = 'dotnet', [ValidatePattern('^[A-Za-z0-9._-]+\.exe$')][string]$OutputName='Dyanari.exe')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& $Dotnet publish action-helper\Dyanari.Actions.csproj -c Release -r win-x64 --self-contained true -o runtime\actions -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw 'Action helper build failed' }
$payload = Join-Path $PSScriptRoot 'desktop\app-payload.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $payload) { Remove-Item -LiteralPath $payload }
$zip = [System.IO.Compression.ZipFile]::Open($payload, 'Create')
try {
  foreach ($file in @('QWEN-IMAGE.md','qwen-image.mjs','image-inspiration.mjs','image-catalog.json','setup-images.ps1','image-runtime/pyproject.toml','image-runtime/uv.lock','image-runtime/dyanari_qwen_node.py','voicestudio-launch.py','setup-voicestudio.ps1','VOICESTUDIO.md','server.mjs','voicestudio.mjs','core.mjs','agent-tasks.mjs','memory.mjs','memory-ledger.mjs','voice.mjs','files.mjs','scheduler.mjs','creative.mjs','vision.mjs','resources.mjs','actions.mjs','development.mjs','linked-projects.mjs','validation.mjs')) {
    if (Test-Path -LiteralPath $file) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot $file), $file, 'Optimal') | Out-Null }
  }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot 'runtime\node.exe'), 'node.exe', 'Optimal') | Out-Null
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $PSScriptRoot 'runtime\actions\Dyanari.Actions.exe'), 'Dyanari.Actions.exe', 'Optimal') | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'public') -File | ForEach-Object { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, ('public/' + $_.Name), 'Optimal') | Out-Null }
} finally { $zip.Dispose() }
& $Dotnet publish desktop\Dyanari.csproj -c Release -r win-x64 --self-contained true -o desktop\publish -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
Copy-Item -LiteralPath desktop\publish\Dyanari.exe -Destination (Join-Path $PSScriptRoot $OutputName) -Force
Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $OutputName) -Algorithm SHA256
