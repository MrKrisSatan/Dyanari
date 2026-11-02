$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$expected=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\Dyanari'))
if([IO.Path]::GetFullPath($PSScriptRoot) -ne $expected){throw 'Uninstaller must run from the registered Dyanari installation folder.'}
if(Get-Process Dyanari -ErrorAction SilentlyContinue){[Windows.Forms.MessageBox]::Show('Close Dyanari before uninstalling.','Dyanari')|Out-Null;exit 1}
if([Windows.Forms.MessageBox]::Show('Remove the Dyanari application? Your memory, settings, models and download cache will be preserved in LocalAppData\Dyanari.','Uninstall Dyanari','YesNo') -ne 'Yes'){exit}
# Delete only known application-owned files. Never recursively remove the data folder.
foreach($name in @('MODLY.md','THIRD-PARTY-MODLY.txt','setup-modly.ps1','modly-catalog.json','modly-runtime/setup.py','modly-runtime/worker.py','modly-runtime/shape/pyproject.toml','modly-runtime/shape/uv.lock','modly-runtime/trellis/pyproject.toml','modly-runtime/trellis/uv.lock','Dyanari.exe','installation.json','setup-voicestudio.ps1','VOICESTUDIO.md','setup-images.ps1','image-catalog.json','QWEN-IMAGE.md','image-runtime/pyproject.toml','image-runtime/uv.lock','image-runtime/dyanari_qwen_node.py')){$p=Join-Path $expected $name;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
$imageConfig=Join-Path $expected 'image-runtime';if((Test-Path -LiteralPath $imageConfig) -and !(Get-ChildItem -LiteralPath $imageConfig -Force)){Remove-Item -LiteralPath $imageConfig}
foreach($relative in @('modly-runtime\shape','modly-runtime\trellis','modly-runtime')){$folder=Join-Path $expected $relative;if((Test-Path -LiteralPath $folder) -and !(Get-ChildItem -LiteralPath $folder -Force)){Remove-Item -LiteralPath $folder}}
$runtime=[IO.Path]::GetFullPath((Join-Path $expected 'runtime'))
if($runtime -ne "$expected\runtime"){throw 'Unexpected runtime path'}
if(Test-Path -LiteralPath $runtime){
 if((Get-Item -LiteralPath $runtime).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing to remove a linked runtime folder'}
 if(Get-ChildItem -LiteralPath $runtime -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Refusing to remove runtime containing linked folders'}
 Remove-Item -LiteralPath $runtime -Recurse -Force
}
$shortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari.lnk'
if(Test-Path -LiteralPath $shortcut){Remove-Item -LiteralPath $shortcut -Force}
$login=Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari - Connect GitHub.lnk'
if(Test-Path -LiteralPath $login){Remove-Item -LiteralPath $login -Force}
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dyanari' -Recurse -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force
[Windows.Forms.MessageBox]::Show('Dyanari removed. Memory and models have been preserved.','Dyanari')|Out-Null
