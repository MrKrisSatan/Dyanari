param([string]$Dotnet='dotnet')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
& $Dotnet publish installer\Setup.csproj -c Release -r win-x64 --self-contained true -o installer\publish -p:NuGetAudit=false
if($LASTEXITCODE -ne 0){throw 'Installer build failed'}
Copy-Item -LiteralPath installer\publish\DyanariSetup.exe -Destination (Join-Path $PSScriptRoot '..\DyanariSetup-0.8.0.exe') -Force
Get-FileHash -LiteralPath (Join-Path $PSScriptRoot '..\DyanariSetup-0.8.0.exe')
