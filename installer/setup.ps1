param([switch]$SelfTest,[string]$Report,[string]$StageTestRoot,[string]$RuntimeArchive)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.IO.Compression.FileSystem
$catalog=Get-Content -LiteralPath "$PSScriptRoot\models.json" -Raw | ConvertFrom-Json
function Recommend([double]$ram,[double]$vram) {
 if($ram -ge 24 -and $vram -ge 12){return 2}
 if($ram -ge 12 -and $vram -ge 6){return 1}
 return 0
}
function Check-Hash($file,$sha) { if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $sha){throw "Download verification failed: $file"} }
function Safe-Target($root,$relative) {
 $target=[IO.Path]::GetFullPath((Join-Path $root $relative))
 if(!$target.StartsWith([IO.Path]::GetFullPath($root).TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe archive path'}
 return $target
}
if($SelfTest){
 $checks=@(); $checks+=(Recommend 8 0) -eq 0; $checks+=(Recommend 16 8) -eq 1; $checks+=(Recommend 32 16) -eq 2; $checks+=(Recommend 64 0) -eq 0
 $checks+=($catalog.Count -eq 3)
 foreach($model in $catalog){$checks+=($model.sha256 -match '^[a-f0-9]{64}$' -and $model.revision -match '^[a-f0-9]{40}$' -and $model.bytes -gt 1GB)}
 try{Safe-Target $PSScriptRoot '..\escape' | Out-Null;$checks+=$false}catch{$checks+=$true}
 try{Check-Hash "$PSScriptRoot\models.json" ('0'*64);$checks+=$false}catch{$checks+=$true}
 $checks+=(Test-Path -LiteralPath "$PSScriptRoot\Dyanari.exe")
 @{passed=($checks -notcontains $false);checks=$checks.Count;catalog=$catalog;appHash=(Get-FileHash "$PSScriptRoot\Dyanari.exe").Hash} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Report
 if($checks -contains $false){exit 1};exit 0
}
$install=Join-Path $env:LOCALAPPDATA 'Programs\Dyanari'
$data=Join-Path $env:LOCALAPPDATA 'Dyanari\data'
$cache=Join-Path $env:LOCALAPPDATA 'Dyanari\downloads'
if($StageTestRoot){
 $StageTestRoot=[IO.Path]::GetFullPath($StageTestRoot)
 if(Test-Path -LiteralPath $StageTestRoot){throw 'Staging test requires a new empty target path.'}
 $install=Join-Path $StageTestRoot 'app';$data=Join-Path $StageTestRoot 'data';$cache=Join-Path $StageTestRoot 'downloads'
}
$ram=[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1)
$cpu=(Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$vram=0; $gpu='CPU fallback (no NVIDIA GPU detected)'
try { $nv=Get-Command nvidia-smi.exe -ErrorAction Stop; $rows=@(& $nv.Source --query-gpu=name,memory.total --format=csv,noheader,nounits); foreach($row in $rows){$parts=$row -split ','; $gb=[double]$parts[-1].Trim()/1024; if($gb -gt $vram){$vram=$gb;$gpu=$parts[0].Trim()}} }catch{}
$recommended=Recommend $ram $vram
$form=New-Object Windows.Forms.Form
$form.Text='Dyanari Setup';$form.Size=New-Object Drawing.Size(740,570);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$info=New-Object Windows.Forms.Label;$info.SetBounds(22,15,685,125);$info.Text="DYANARI - LOCAL COMPANION`r`n`r`n$cpu`r`n$ram GB RAM | $gpu | $([math]::Round($vram,1)) GB NVIDIA VRAM`r`nPer-user installation: $install`r`nMemory: $data (shared by every model; preserved on reinstall/uninstall)";$form.Controls.Add($info)
$models=New-Object Windows.Forms.ComboBox;$models.DropDownStyle='DropDownList';$models.SetBounds(22,147,680,28)
foreach($model in $catalog){[void]$models.Items.Add("$($model.name) - $([math]::Round($model.bytes/1GB,2)) GiB" )};[void]$models.Items.Add('Install application only (choose a model later)');$models.SelectedIndex=$recommended;$form.Controls.Add($models)
if($ram -lt 7.5){$models.SelectedIndex=$catalog.Count}
$detail=New-Object Windows.Forms.TextBox;$detail.Multiline=$true;$detail.ReadOnly=$true;$detail.ScrollBars='Vertical';$detail.SetBounds(22,185,680,145);$form.Controls.Add($detail)
$update={
 if($models.SelectedIndex -lt $catalog.Count){$m=$catalog[$models.SelectedIndex];$detail.Text="Recommended tier: $($catalog[$recommended].name)`r`nSelected: https://huggingface.co/$($m.repo)`r`nQ4_K_M | revision $($m.revision)`r`nCommunity abliterated model: refusal reduction is not guaranteed. Review the model card and license before installing. Tool permissions remain under your control.`r`nDownloads: model above + Ollama runtime (1.49 GiB), and WebView2 if missing. Allow at least $([math]::Ceiling(6+3*$m.bytes/1GB)) GiB free for temporary files and model import. CPU-only inference is slower."}
 else{$detail.Text='Installs Dyanari, local Ollama runtime (1.49 GiB download), and WebView2 if needed. No chat model will be downloaded. Run this installer again to add one. Existing memory and settings are preserved.'}
};$models.add_SelectedIndexChanged($update);& $update
$progress=New-Object Windows.Forms.ProgressBar;$progress.SetBounds(22,347,680,22);$form.Controls.Add($progress)
$status=New-Object Windows.Forms.Label;$status.SetBounds(22,380,680,70);$status.Text='Windows 10/11 x64. Internet is needed during setup. No admin access required.';$form.Controls.Add($status)
$button=New-Object Windows.Forms.Button;$button.Text='Install';$button.SetBounds(480,470,105,32);$form.Controls.Add($button)
$cancel=New-Object Windows.Forms.Button;$cancel.Text='Close';$cancel.SetBounds(597,470,105,32);$form.Controls.Add($cancel)
$script:running=$false;$script:cancelled=$false
$cancel.add_Click({if($script:running){$script:cancelled=$true;$cancel.Enabled=$false}else{$form.Close()}})
$form.add_FormClosing({param($sender,$event) if($script:running){$script:cancelled=$true;$event.Cancel=$true}})
function Pump { [Windows.Forms.Application]::DoEvents();if($script:cancelled){throw 'Installation cancelled. Run setup again to retry; memory is preserved.'} }
function Download($url,$target,$sha,$expected=0) {
 if((Test-Path -LiteralPath $target) -and $sha){try{Check-Hash $target $sha;return}catch{}}
 $status.Text="Downloading $(Split-Path $target -Leaf)...";Pump
 $client=New-Object Net.Http.HttpClient
 try {
  $client.Timeout=[TimeSpan]::FromHours(8)
  $task=$client.GetAsync($url,[Net.Http.HttpCompletionOption]::ResponseHeadersRead);while(!$task.IsCompleted){Pump;Start-Sleep -Milliseconds 80}
  $response=$task.GetAwaiter().GetResult();$response.EnsureSuccessStatusCode() | Out-Null
  $total=$response.Content.Headers.ContentLength;$source=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$dest=[IO.File]::Create($target+'.partial')
  try{$buffer=New-Object byte[] 1048576;$count=0L;while($true){$read=$source.ReadAsync($buffer,0,$buffer.Length);while(!$read.IsCompleted){Pump;Start-Sleep -Milliseconds 60};$n=$read.GetAwaiter().GetResult();if(!$n){break};$dest.Write($buffer,0,$n);$count+=$n;if($total){$progress.Value=[math]::Min(100,[int](100*$count/$total))};$status.Text="Downloading $(Split-Path $target -Leaf): $([math]::Round($count/1MB)) MiB";Pump}}finally{$dest.Dispose();$source.Dispose();$response.Dispose()}
  if($expected -and $count -ne $expected){throw 'Unexpected download size'}
  if($sha){Check-Hash ($target+'.partial') $sha}
  Move-Item -LiteralPath ($target+'.partial') -Destination $target -Force
 }finally{$client.Dispose()}
}
function Run($exe,$arguments,$environment=@{}) {
 $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$exe;$psi.Arguments=$arguments;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 foreach($key in $environment.Keys){$psi.EnvironmentVariables[$key]=$environment[$key]}
 $p=[Diagnostics.Process]::Start($psi)
 try{while(!$p.HasExited){try{Pump}catch{try{$p.Kill()}catch{};throw};Start-Sleep -Milliseconds 100};if($p.ExitCode -ne 0){throw "$exe exited with code $($p.ExitCode)"}}finally{$p.Dispose()}
}
Add-Type -AssemblyName System.Net.Http
$installAction={
 $script:running=$true;$script:cancelled=$false;$button.Enabled=$false;$models.Enabled=$false;$cancel.Text='Cancel'
 try {
  if([Environment]::OSVersion.Version.Build -lt 19041){throw 'Windows 10 build 19041 or newer is required.'}
  if(!$StageTestRoot -and (Get-Process Dyanari -ErrorAction SilentlyContinue)){throw 'Close Dyanari before installing or updating.'}
  $choice=$models.SelectedIndex;$required=6;if($choice -lt $catalog.Count){$required=[math]::Ceiling(6+3*$catalog[$choice].bytes/1GB)}
  if($choice -lt $catalog.Count -and $ram -lt 7.5){throw 'At least 8 GB RAM is recommended. Choose application-only setup on this machine.'}
  if((New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($install))).AvailableFreeSpace -lt $required*1GB){throw "At least $required GiB free disk space is required."}
  foreach($dir in @($install,$data,$cache)){[void][IO.Directory]::CreateDirectory($dir)}
  $ollamaZip=Join-Path $cache 'ollama-v0.40.13.zip'
  if($StageTestRoot -and $RuntimeArchive){Copy-Item -LiteralPath $RuntimeArchive -Destination $ollamaZip}
  Download 'https://github.com/ollama/ollama/releases/download/v0.40.13/ollama-windows-amd64.zip' $ollamaZip '7afa38624fa62ee5d8293422d0ab084c1bb4603134c7f4dafce11a033b57cc19' 1601969847
  $status.Text='Extracting verified Ollama runtime...';Pump
  $runtime=Join-Path $install 'runtime\ollama';[void][IO.Directory]::CreateDirectory($runtime)
  $zip=[IO.Compression.ZipFile]::OpenRead($ollamaZip)
  try{foreach($entry in $zip.Entries){Pump;$target=Safe-Target $runtime $entry.FullName;if(!$entry.Name){[void][IO.Directory]::CreateDirectory($target);continue};[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target));[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)}}finally{$zip.Dispose()}
  if(!$StageTestRoot){
   $dependencies=@(
    @{name='mingit-2.56.0.4.zip';url='https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/MinGit-2.56.0.4-64-bit.zip';sha='e3bf78351fe777fba47ddee5950082f8a98bb0f02604fdc7ba3ee2cb68ffa877';bytes=39846926;folder='git'},
    @{name='gh-2.103.3.zip';url='https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_windows_amd64.zip';sha='98d0cfa794721665d7973dd728c78aff7bd836d58f10f6d7a03568eccb0a22e0';bytes=15197187;folder='gh'}
    @{name='node-v24.22.1-win-x64.zip';url='https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip';sha='d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5';bytes=37748064;folder='node';stripRoot=$true}
   )
   foreach($dep in $dependencies){
    $archive=Join-Path $cache $dep.name;Download $dep.url $archive $dep.sha $dep.bytes
    $targetRoot=Join-Path $install ('runtime\'+$dep.folder);[void][IO.Directory]::CreateDirectory($targetRoot)
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{foreach($entry in $zip.Entries){Pump;$relative=$entry.FullName;if($dep.stripRoot){$relative=$relative -replace '^[^/]+/',''};if(!$relative -or !$entry.Name){continue};$target=Safe-Target $targetRoot $relative;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target));[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)}}finally{$zip.Dispose()}
   }
  }
  # Microsoft's official per-user evergreen bootstrapper; validate Authenticode before execution.
  $webview=$false
  foreach($hive in @('HKCU:\Software\Microsoft\EdgeUpdate\Clients','HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients','HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients')){if(Test-Path $hive){foreach($key in Get-ChildItem $hive){$p=Get-ItemProperty $key.PSPath;if($p.name -match 'WebView2' -and $p.pv -and $p.pv -ne '0.0.0.0'){$webview=$true}}}}
  if(!$webview -and !$StageTestRoot){$bootstrap=Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe';Download 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' $bootstrap ''; $sig=Get-AuthenticodeSignature $bootstrap;if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation,'){throw 'Microsoft WebView2 signature validation failed'};Run $bootstrap '/silent /install'}
  $payload="$PSScriptRoot\Dyanari.exe"
  if($StageTestRoot -and !(Test-Path $payload)){$payload="$PSScriptRoot\..\desktop\publish\Dyanari.exe"}
  Copy-Item -LiteralPath $payload -Destination "$install\Dyanari.exe.new" -Force
  Check-Hash "$install\Dyanari.exe.new" (Get-FileHash $payload).Hash
  Move-Item -LiteralPath "$install\Dyanari.exe.new" -Destination "$install\Dyanari.exe" -Force
  $config=@{installed=$true;dataPath=$data}
  if(Test-Path "$install\installation.json"){$old=Get-Content "$install\installation.json" -Raw|ConvertFrom-Json;if($old.defaultModel){$config.defaultModel=$old.defaultModel}}
  $config|ConvertTo-Json|Set-Content "$install\installation.json" -Encoding UTF8
  if($choice -lt $catalog.Count){
   $m=$catalog[$choice];$weights=Join-Path $cache ($m.tag.Replace(':','-')+'.gguf')
   Download "https://huggingface.co/$($m.repo)/resolve/$($m.revision)/$($m.file)" $weights $m.sha256 $m.bytes
   # Isolated temporary endpoint avoids importing into an unrelated Ollama service.
   $listener=New-Object Net.Sockets.TcpListener ([Net.IPAddress]::Loopback),0;$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
   $envs=@{OLLAMA_HOST="127.0.0.1:$port";OLLAMA_MODELS="$data\models";OLLAMA_NO_CLOUD='1'}
   $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName="$runtime\ollama.exe";$start.Arguments='serve';$start.UseShellExecute=$false;$start.CreateNoWindow=$true;foreach($key in $envs.Keys){$start.EnvironmentVariables[$key]=$envs[$key]};$service=[Diagnostics.Process]::Start($start)
   try{
    $ready=$false;for($i=0;$i -lt 60;$i++){Pump;try{Invoke-RestMethod "http://127.0.0.1:$port/api/version" -TimeoutSec 1|Out-Null;$ready=$true;break}catch{Start-Sleep -Milliseconds 300}};if(!$ready){throw 'Local Ollama runtime failed to start'}
    $modelfile=Join-Path $cache 'Modelfile';[IO.File]::WriteAllText($modelfile,"FROM `"$($weights.Replace('\','/'))`"`nPARAMETER num_ctx 4096`n")
    $status.Text='Importing verified model into local storage...';Pump
    Run "$runtime\ollama.exe" "create $($m.tag) -f `"$modelfile`"" $envs
    $config.defaultModel=$m.tag
   }finally{if(!$service.HasExited){$service.Kill()};$service.Dispose()}
  }
  $config|ConvertTo-Json|Set-Content "$install\installation.json" -Encoding UTF8
  if(!$StageTestRoot){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari.lnk'));$shortcut.TargetPath="$install\Dyanari.exe";$shortcut.WorkingDirectory=$install;$shortcut.Save()
  $login=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari - Connect GitHub.lnk'));$login.TargetPath="$install\runtime\gh\bin\gh.exe";$login.Arguments='auth login --web --hostname github.com --git-protocol https';$login.WorkingDirectory=$install;$login.Save()
  $status.Text='Installed successfully. Use Dyanari in the Start menu. Setup can be rerun to add or change models. Memory and permissions are preserved.';$button.Text='Open Dyanari';$button.Enabled=$true;$models.Enabled=$false
  Copy-Item -LiteralPath "$PSScriptRoot\uninstall.ps1" -Destination "$install\uninstall.ps1" -Force
  $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dyanari'
  [void](New-Item $key -Force)
  $ps=Join-Path $PSHOME 'powershell.exe'
  $values=@{DisplayName='Dyanari';DisplayVersion='0.5.0';Publisher='Dyanari Project';InstallLocation=$install;DisplayIcon="$install\Dyanari.exe";UninstallString="`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$install\uninstall.ps1`""}
  foreach($name in $values.Keys){Set-ItemProperty $key -Name $name -Value $values[$name]}
  }
  $script:complete=$true
 }catch{$status.Text=$_.Exception.Message;if($StageTestRoot){throw};[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Dyanari Setup')|Out-Null;$button.Enabled=$true;$models.Enabled=$true}
 finally{$script:running=$false;$cancel.Enabled=$true;$cancel.Text='Close';if($script:complete){$button.Enabled=$false;if(!$StageTestRoot){Start-Process -FilePath "$install\Dyanari.exe"}}}
}
$button.add_Click($installAction)
if($StageTestRoot){$models.SelectedIndex=$catalog.Count;& $installAction;@{passed=[bool]$script:complete;app=(Test-Path "$install\Dyanari.exe");runtime=(Test-Path "$install\runtime\ollama\ollama.exe");config=(Get-Content "$install\installation.json" -Raw|ConvertFrom-Json)} | ConvertTo-Json | Set-Content -LiteralPath $Report;exit}
[void]$form.ShowDialog()
