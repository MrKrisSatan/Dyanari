param([switch]$SelfTest,[string]$Report,[string]$StageTestRoot,[string]$RuntimeArchive)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.IO.Compression.FileSystem
$catalog=Get-Content -LiteralPath "$PSScriptRoot\models.json" -Raw | ConvertFrom-Json
$imageCatalog=Get-Content -LiteralPath "$PSScriptRoot\image-catalog.json" -Raw|ConvertFrom-Json
$meshCatalog=Get-Content -LiteralPath "$PSScriptRoot\modly-catalog.json" -Raw|ConvertFrom-Json
function Recommend-Image([double]$ram,[double]$vram){$fit=@($imageCatalog.bundles|Where-Object {!$_.community -and $ram+0.5 -ge $_.ram -and $vram -ge $_.vram});if($fit.Count){return $fit[-1].id};return ''}
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
 $checks+=((Recommend-Image 16 8) -eq 'q4');$checks+=((Recommend-Image 24 8) -eq 'q4');$checks+=((Recommend-Image 32 12) -eq 'q5');$checks+=((Recommend-Image 64 24) -eq 'q8');$checks+=((Recommend-Image 8 0) -eq '')
 foreach($bundle in $imageCatalog.bundles){$checks+=($bundle.files.Count -ge 3 -and @($bundle.files|Where-Object {$_.sha256 -notmatch '^[a-f0-9]{64}$' -or $_.revision -notmatch '^[a-f0-9]{40}$' -or $_.bytes -le 0}).Count -eq 0)}
 foreach($bundle in $meshCatalog.bundles){$checks+=($bundle.revision -match '^[a-f0-9]{40}$' -and $bundle.files.Count -ge 6 -and @($bundle.files|Where-Object {$_.sha256 -notmatch '^[a-f0-9]{64}$' -or $_.bytes -le 0}).Count -eq 0)}
 foreach($extra in @('MODLY.md','THIRD-PARTY-MODLY.txt','setup-modly.ps1','modly-catalog.json','modly-runtime/setup.py','modly-runtime/worker.py','modly-runtime/shape/pyproject.toml','modly-runtime/shape/uv.lock','modly-runtime/trellis/pyproject.toml','modly-runtime/trellis/uv.lock','QWEN-IMAGE.md','setup-images.ps1','image-catalog.json','image-runtime/pyproject.toml','image-runtime/uv.lock','image-runtime/dyanari_qwen_node.py','setup-voicestudio.ps1','VOICESTUDIO.md')){$checks+=(Test-Path -LiteralPath (Join-Path $PSScriptRoot $extra))}
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
$form.Text='Dyanari Setup';$form.Size=New-Object Drawing.Size(740,([math]::Min(790,[Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height-30)));$form.AutoScroll=$true;$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$info=New-Object Windows.Forms.Label;$info.SetBounds(22,15,685,125);$info.Text="DYANARI - LOCAL COMPANION`r`n`r`n$cpu`r`n$ram GB RAM | $gpu | $([math]::Round($vram,1)) GB NVIDIA VRAM`r`nPer-user installation: $install`r`nMemory: $data (shared by every model; preserved on reinstall/uninstall)";$form.Controls.Add($info)
$models=New-Object Windows.Forms.ComboBox;$models.DropDownStyle='DropDownList';$models.SetBounds(22,147,680,28)
foreach($model in $catalog){[void]$models.Items.Add("$($model.name) - $([math]::Round($model.bytes/1GB,2)) GiB" )};[void]$models.Items.Add('Install application only (choose a model later)');$models.SelectedIndex=$recommended;$form.Controls.Add($models)
if($ram -lt 7.5){$models.SelectedIndex=$catalog.Count}
$detail=New-Object Windows.Forms.TextBox;$detail.Multiline=$true;$detail.ReadOnly=$true;$detail.ScrollBars='Vertical';$detail.SetBounds(22,185,680,145);$form.Controls.Add($detail)
$update={
 if($models.SelectedIndex -lt $catalog.Count){$m=$catalog[$models.SelectedIndex];$detail.Text="Recommended tier: $($catalog[$recommended].name)`r`nSelected: https://huggingface.co/$($m.repo)`r`nQ4_K_M | revision $($m.revision)`r`nCommunity abliterated model: refusal reduction is not guaranteed. Review the model card and license before installing. Tool permissions remain under your control.`r`nDownloads: model above + Ollama runtime (1.49 GiB), and WebView2 if missing. Allow at least $([math]::Ceiling(6+3*$m.bytes/1GB)) GiB free for temporary files and model import. CPU-only inference is slower."}
 else{$detail.Text='Installs Dyanari, local Ollama runtime (1.49 GiB download), and WebView2 if needed. No chat model will be downloaded. Run this installer again to add one. Existing memory and settings are preserved.'}
};$models.add_SelectedIndexChanged($update);& $update
$imageCheck=New-Object Windows.Forms.CheckBox;$imageCheck.Text='Also install local Qwen Image 2.1 (optional multi-GB download)';$imageCheck.SetBounds(22,340,680,24);$form.Controls.Add($imageCheck)
$imageModels=New-Object Windows.Forms.ComboBox;$imageModels.DropDownStyle='DropDownList';$imageModels.SetBounds(22,371,680,28);[void]$imageModels.Items.Add('Skip image setup / choose later')
$imageRecommended=Recommend-Image $ram $vram;$imageModels.SelectedIndex=0
for($i=0;$i -lt $imageCatalog.bundles.Count;$i++){ $b=$imageCatalog.bundles[$i];[void]$imageModels.Items.Add($b.name+' — '+[math]::Round($b.bytes/1GB,1)+' GiB');if($b.id -eq $imageRecommended){$imageModels.SelectedIndex=$i+1} };$form.Controls.Add($imageModels)
$imageDetail=New-Object Windows.Forms.TextBox;$imageDetail.Multiline=$true;$imageDetail.ReadOnly=$true;$imageDetail.ScrollBars='Vertical';$imageDetail.SetBounds(22,407,680,80);$form.Controls.Add($imageDetail)
$imageUpdate={if($imageModels.SelectedIndex -gt 0){$b=$imageCatalog.bundles[$imageModels.SelectedIndex-1];$imageDetail.Text='Conservative minimum: '+$b.ram+' GB RAM / '+$b.vram+' GB NVIDIA VRAM. Recommended: '+$imageRecommended+'. Includes diffusion, text encoder, VAE and a separate pinned ComfyUI/GGUF runtime. '+$(if($b.encoderCommunity){'Compact text encoder is community Heretic Q4 + matching vision projector. '}else{'Official INT8 text encoder. '})+'Community uncensored labels are author claims, not guarantees. All files are hash verified. CPU fallback can be very slow.'}else{$imageDetail.Text='No suitable automatic image tier for this hardware, or image setup skipped. Existing image models and memory are preserved.'}};$imageModels.add_SelectedIndexChanged($imageUpdate);& $imageUpdate
$imageTerms=New-Object Windows.Forms.CheckBox;$imageTerms.Text='I accept the Qwen Research License: research/evaluation only unless separately licensed.';$imageTerms.SetBounds(22,495,680,34);$form.Controls.Add($imageTerms)
$termsLink=New-Object Windows.Forms.LinkLabel;$termsLink.Text='Review Qwen model terms';$termsLink.SetBounds(22,532,250,20);$termsLink.add_LinkClicked({Start-Process 'https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE'});$form.Controls.Add($termsLink)
$imageOverride=New-Object Windows.Forms.CheckBox;$imageOverride.Text='Try hardware-limited image tier (CPU / slower offload; may not fit)';$imageOverride.SetBounds(280,532,425,24);$form.Controls.Add($imageOverride)
$meshCheck=New-Object Windows.Forms.CheckBox;$meshCheck.Text='Also install a local Modly 3D backend (optional multi-GB download)';$meshCheck.SetBounds(22,570,680,24);$form.Controls.Add($meshCheck)
$meshModels=New-Object Windows.Forms.ComboBox;$meshModels.DropDownStyle='DropDownList';$meshModels.SetBounds(22,603,680,28);[void]$meshModels.Items.Add('Skip 3D setup / choose later');$meshModels.SelectedIndex=0
for($i=0;$i -lt $meshCatalog.bundles.Count;$i++){$b=$meshCatalog.bundles[$i];[void]$meshModels.Items.Add($b.name+' - '+[math]::Round($b.bytes/1GB,1)+' GiB weights');if($b.id -eq 'tripo' -and $ram+0.5 -ge 16 -and $vram -ge 8){$meshModels.SelectedIndex=$i+1}};$form.Controls.Add($meshModels)
$meshTerms=New-Object Windows.Forms.CheckBox;$meshTerms.Text="I reviewed and accept the selected 3D model and auxiliary components' licences.";$meshTerms.SetBounds(22,640,680,34);$form.Controls.Add($meshTerms)
$meshDetail=New-Object Windows.Forms.TextBox;$meshDetail.Multiline=$true;$meshDetail.ReadOnly=$true;$meshDetail.ScrollBars='Vertical';$meshDetail.SetBounds(22,681,680,88);$form.Controls.Add($meshDetail)
$meshUpdate={if($meshModels.SelectedIndex -gt 0){$b=$meshCatalog.bundles[$meshModels.SelectedIndex-1];$meshDetail.Text=$b.license+"`r`n"+$b.licenseUrl+"`r`nGuidance: "+$b.ram+' GB RAM / '+$b.vram+' GB NVIDIA VRAM. Trellis also uses the DINOv3 licence: https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md'}else{$meshDetail.Text='Skip 3D setup. Install TripoSG, Hunyuan3D Mini Turbo or Trellis.2 GGUF later in 3D Studio. Based on Modly by Lightning Pixel.'};$meshTerms.Checked=$false};$meshModels.add_SelectedIndexChanged($meshUpdate);& $meshUpdate
$meshTerritory=New-Object Windows.Forms.CheckBox;$meshTerritory.Text='Hunyuan only: I have territorial eligibility or separate rights. Published terms exclude UK, EU and South Korea.';$meshTerritory.SetBounds(22,779,680,40);$form.Controls.Add($meshTerritory)
$meshOverride=New-Object Windows.Forms.CheckBox;$meshOverride.Text='Allow 3D setup below hardware guidance (may run out of memory)';$meshOverride.SetBounds(22,825,680,26);$form.Controls.Add($meshOverride)
$progress=New-Object Windows.Forms.ProgressBar;$progress.SetBounds(22,868,680,22);$form.Controls.Add($progress)
$status=New-Object Windows.Forms.Label;$status.SetBounds(22,902,680,62);$status.Text='Windows 10/11 x64. Internet is needed during setup. No admin access required.';$form.Controls.Add($status)
$button=New-Object Windows.Forms.Button;$button.Text='Install';$button.SetBounds(480,982,105,32);$form.Controls.Add($button)
$cancel=New-Object Windows.Forms.Button;$cancel.Text='Close';$cancel.SetBounds(597,982,105,32);$form.Controls.Add($cancel)
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
  # Copy on the .NET asynchronous I/O path. Poll only the UI, not every network
  # read: sleeping after each small TLS read throttles multi-GB downloads.
  try {
   $copy=$source.CopyToAsync($dest,1048576)
   while(!$copy.IsCompleted){
    Pump
    $count=$dest.Length
    if($total){$progress.Value=[math]::Min(100,[int](100*$count/$total))}
    $status.Text="Downloading $(Split-Path $target -Leaf): $([math]::Round($count/1MB)) MiB"
    Start-Sleep -Milliseconds 100
   }
   [void]$copy.GetAwaiter().GetResult();$dest.Flush();$count=$dest.Length
   Pump
  } finally {$source.Dispose();$dest.Dispose();$response.Dispose()}
  if($expected -and $count -ne $expected){throw 'Unexpected download size'}
  if($sha){Check-Hash ($target+'.partial') $sha}
  Move-Item -LiteralPath ($target+'.partial') -Destination $target -Force
 }finally{$client.Dispose()}
}
function Run($exe,$arguments,$environment=@{}) {
 $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$exe;$psi.Arguments=$arguments;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 foreach($key in $environment.Keys){$psi.EnvironmentVariables[$key]=$environment[$key]}
 $p=[Diagnostics.Process]::Start($psi)
 # GUI setup has no console. Give CLI children valid pipes and drain BOTH while
 # they run; otherwise Ollama can import successfully and hang on terminal I/O.
 $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
 try{while(!$p.HasExited){try{Pump}catch{try{$killInfo=New-Object Diagnostics.ProcessStartInfo;$killInfo.FileName='taskkill.exe';$killInfo.Arguments="/PID $($p.Id) /T /F";$killInfo.UseShellExecute=$false;$killInfo.CreateNoWindow=$true;$killer=[Diagnostics.Process]::Start($killInfo);$killer.WaitForExit();$killer.Dispose()}catch{};throw};Start-Sleep -Milliseconds 100};Write-Output $stdout.GetAwaiter().GetResult();Write-Output $stderr.GetAwaiter().GetResult();if($p.ExitCode -ne 0){throw "$exe exited with code $($p.ExitCode)"}}finally{$p.Dispose()}
}
Add-Type -AssemblyName System.Net.Http
$installAction={
 $script:running=$true;$script:cancelled=$false;$button.Enabled=$false;$models.Enabled=$false;$cancel.Text='Cancel';foreach($control in @($imageCheck,$imageModels,$imageTerms,$imageOverride,$meshCheck,$meshModels,$meshTerms,$meshTerritory,$meshOverride)){$control.Enabled=$false}
 try {
  if([Environment]::OSVersion.Version.Build -lt 19041){throw 'Windows 10 build 19041 or newer is required.'}
  if(!$StageTestRoot -and (Get-Process Dyanari -ErrorAction SilentlyContinue)){throw 'Close Dyanari before installing or updating.'}
  $imageChoice=$imageModels.SelectedIndex
  if($imageCheck.Checked){if($imageChoice -le 0){throw 'Select an image bundle or turn off optional image setup'};if(!$imageTerms.Checked){throw 'Review and accept Qwen model terms before image setup'};$ib=$imageCatalog.bundles[$imageChoice-1];if(($ram+0.5 -lt $ib.ram -or $vram -lt $ib.vram) -and !$imageOverride.Checked){throw 'Selected image bundle exceeds hardware guidance. Choose the recommended tier, skip, or explicitly override.'}}
  if($meshCheck.Checked){if($meshModels.SelectedIndex -le 0 -or !$meshTerms.Checked){throw 'Select a 3D bundle and review/accept its terms'};$mb=$meshCatalog.bundles[$meshModels.SelectedIndex-1];if($mb.id -eq 'hunyuan' -and !$meshTerritory.Checked){throw 'Hunyuan requires territorial eligibility or separate rights; UK, EU and South Korea excluded'};if(($ram+0.5 -lt $mb.ram -or $vram -lt $mb.vram) -and !$meshOverride.Checked){throw 'Selected 3D backend exceeds hardware guidance; choose a smaller backend or explicitly override'}}
  $choice=$models.SelectedIndex;$required=6;if($choice -lt $catalog.Count){$required=[math]::Ceiling(6+3*$catalog[$choice].bytes/1GB)}
  if($choice -lt $catalog.Count -and $ram -lt 7.5){throw 'At least 8 GB RAM is recommended. Choose application-only setup on this machine.'}
  if($imageCheck.Checked){$required+=[math]::Ceiling(8+$ib.bytes/1GB)}
  if($meshCheck.Checked){$required+=[math]::Ceiling(12+$mb.bytes/1GB)}
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
  foreach($extra in @('MODLY.md','THIRD-PARTY-MODLY.txt','setup-modly.ps1','modly-catalog.json','modly-runtime/setup.py','modly-runtime/worker.py','modly-runtime/shape/pyproject.toml','modly-runtime/shape/uv.lock','modly-runtime/trellis/pyproject.toml','modly-runtime/trellis/uv.lock','QWEN-IMAGE.md','setup-images.ps1','image-catalog.json','image-runtime/pyproject.toml','image-runtime/uv.lock','image-runtime/dyanari_qwen_node.py','setup-voicestudio.ps1','VOICESTUDIO.md')){ $extraSource=Join-Path $PSScriptRoot $extra;if(!(Test-Path -LiteralPath $extraSource)){$extraSource=Join-Path (Split-Path $PSScriptRoot -Parent) $extra};[void][IO.Directory]::CreateDirectory((Split-Path (Join-Path $install $extra) -Parent));Copy-Item -LiteralPath $extraSource -Destination (Join-Path $install $extra) -Force }
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
  if($imageCheck.Checked){$psImage=Join-Path $PSHOME 'powershell.exe';$imageArgs='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File '+[char]34+(Join-Path $install 'setup-images.ps1')+[char]34+' -BundleId '+$ib.id+' -AcceptResearchTerms';if($vram -eq 0){$imageArgs+=' -Cpu'};Run $psImage $imageArgs}
  if($meshCheck.Checked){$psMesh=Join-Path $PSHOME 'powershell.exe';$meshArgs='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File '+[char]34+(Join-Path $install 'setup-modly.ps1')+[char]34+' -BundleId '+$mb.id+' -AcceptModelTerms';if($mb.id -eq 'hunyuan'){$meshArgs+=' -HunyuanTerritoryEligible'};Run $psMesh $meshArgs}
  if(!$StageTestRoot){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari.lnk'));$shortcut.TargetPath="$install\Dyanari.exe";$shortcut.WorkingDirectory=$install;$shortcut.Save()
  $login=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Dyanari - Connect GitHub.lnk'));$login.TargetPath="$install\runtime\gh\bin\gh.exe";$login.Arguments='auth login --web --hostname github.com --git-protocol https';$login.WorkingDirectory=$install;$login.Save()
  $status.Text='Installed successfully. Use Dyanari in the Start menu. Setup can be rerun to add or change models. Memory and permissions are preserved.';$button.Text='Open Dyanari';$button.Enabled=$true;$models.Enabled=$false
  Copy-Item -LiteralPath "$PSScriptRoot\uninstall.ps1" -Destination "$install\uninstall.ps1" -Force
  $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Dyanari'
  [void](New-Item $key -Force)
  $ps=Join-Path $PSHOME 'powershell.exe'
  $values=@{DisplayName='Dyanari';DisplayVersion='0.11.0';Publisher='Dyanari Project';InstallLocation=$install;DisplayIcon="$install\Dyanari.exe";UninstallString="`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$install\uninstall.ps1`""}
  foreach($name in $values.Keys){Set-ItemProperty $key -Name $name -Value $values[$name]}
  }
  $script:complete=$true
 }catch{$status.Text=$_.Exception.Message;if($StageTestRoot){throw};[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Dyanari Setup')|Out-Null;$button.Enabled=$true;$models.Enabled=$true;foreach($control in @($imageCheck,$imageModels,$imageTerms,$imageOverride,$meshCheck,$meshModels,$meshTerms,$meshTerritory,$meshOverride)){$control.Enabled=$true}}
 finally{$script:running=$false;$cancel.Enabled=$true;$cancel.Text='Close';if($script:complete){$button.Enabled=$false;if(!$StageTestRoot){Start-Process -FilePath "$install\Dyanari.exe"}}}
}
$button.add_Click($installAction)
if($StageTestRoot){$models.SelectedIndex=$catalog.Count;& $installAction;@{passed=[bool]$script:complete;app=(Test-Path "$install\Dyanari.exe");runtime=(Test-Path "$install\runtime\ollama\ollama.exe");config=(Get-Content "$install\installation.json" -Raw|ConvertFrom-Json)} | ConvertTo-Json | Set-Content -LiteralPath $Report;exit}
[void]$form.ShowDialog()
