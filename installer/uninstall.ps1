$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$expected=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\Dyanari'))
if([IO.Path]::GetFullPath($PSScriptRoot) -ne $expected){throw 'Uninstaller must run from the registered Dyanari installation folder.'}
if(Get-Process Dyanari -ErrorAction SilentlyContinue){[Windows.Forms.MessageBox]::Show('Close Dyanari before uninstalling.','Dyanari')|Out-Null;exit 1}
if([Windows.Forms.MessageBox]::Show('Remove the Dyanari application? Your memory, settings, models and download cache will be preserved in LocalAppData\Dyanari.','Uninstall Dyanari','YesNo') -ne 'Yes'){exit}
# Delete only known application-owned files. Never recursively remove the data folder.
foreach($name in @('Dyanari.exe','installation.json')){$p=Join-Path $expected $name;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
$runtime=[IO.Path]::GetFullPath((Join-Path $expected 'runtime'))
if($runtime -ne "$expected\runtime"){throw 'Unexpected runtime path'}
if(Test-Path -LiteralPath $runtime){
 if((Get-Item -LiteralPath $runtime).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing to remove a linked runtime folder'}
 if(Get-ChildItem -LiteralPath $runtime -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Refusing to remove runtime containing linked folders'}
 Remove-Item -LiteralPath $runtime -Recurse -Force
}
$shortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari.lnk'
if(Test-Path -LiteralPath $shortcut){Remove-Item -LiteralPath $shortcut -Force}
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dyanari' -Recurse -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force
[Windows.Forms.MessageBox]::Show('Dyanari removed. Memory and models have been preserved.','Dyanari')|Out-Null
