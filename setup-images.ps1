param([Parameter(Mandatory=$true)][string]$BundleId,[switch]$AcceptResearchTerms,[string]$Cache='',[switch]$Cpu,[string]$RuntimeRoot='')
$ErrorActionPreference='Stop'
if(!$AcceptResearchTerms){throw 'Review the Qwen Research License (research/evaluation only unless separately licensed), then explicitly accept it before downloading.'}
$catalog=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'image-catalog.json') -Raw|ConvertFrom-Json
$bundle=@($catalog.bundles|Where-Object id -eq $BundleId)
if($bundle.Count -ne 1){throw 'Unknown pinned image bundle'};$bundle=$bundle[0]
if(!$RuntimeRoot){$RuntimeRoot=if($env:DYANARI_IMAGE_HOME){$env:DYANARI_IMAGE_HOME}else{Join-Path $env:USERPROFILE '.dyanari\images'}}
$root=[IO.Path]::GetFullPath($RuntimeRoot);if($root.TrimEnd('\') -eq [IO.Path]::GetPathRoot($root).TrimEnd('\')){throw 'Choose an image runtime subfolder, not a drive root'};$source=Join-Path $root 'ComfyUI'
if(!$Cache){$Cache=Join-Path $root 'downloads'}
foreach($dir in @($root,$Cache)){New-Item -ItemType Directory -Force -Path $dir|Out-Null}
Add-Type -AssemblyName System.Net.Http
function Fetch($url,$dest,$sha,[long]$bytes=0){
 if((Test-Path -LiteralPath $dest) -and (Get-FileHash -LiteralPath $dest).Hash -eq $sha){return}
 Write-Output ('Downloading '+[IO.Path]::GetFileName($dest))
 & curl.exe --location --fail --retry 3 --retry-delay 2 --connect-timeout 20 --speed-time 60 --speed-limit 1024 --max-time 7200 --silent --show-error --output ($dest+'.partial') $url
 if($LASTEXITCODE){throw 'Image download failed or stalled; rerun setup to retry. Completed verified files are retained.'}
 if($bytes -and (Get-Item -LiteralPath ($dest+'.partial')).Length -ne $bytes){throw 'Model download size mismatch'}
 if((Get-FileHash -LiteralPath ($dest+'.partial')).Hash -ne $sha){throw 'Download SHA-256 mismatch'}
 Move-Item -LiteralPath ($dest+'.partial') -Destination $dest -Force
}
function Extract($archive,$expanded,$target){
 if(Test-Path -LiteralPath $target){return}
 Expand-Archive -LiteralPath $archive -DestinationPath $root -Force
 $full=[IO.Path]::GetFullPath((Join-Path $root $expanded));if(!(Split-Path $full -Parent).Equals([IO.Path]::GetFullPath($root),[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe extraction move'}
 Move-Item -LiteralPath $full -Destination $target
}
$comfy=Join-Path $Cache 'qwen-comfy.zip';Fetch $catalog.comfy.url $comfy $catalog.comfy.sha256;Extract $comfy ('ComfyUI-'+$catalog.comfy.revision) $source
$gguf=Join-Path $Cache 'qwen-gguf.zip';Fetch $catalog.gguf.url $gguf $catalog.gguf.sha256;Extract $gguf ('ComfyUI-GGUF-'+$catalog.gguf.revision) (Join-Path $source 'custom_nodes\ComfyUI-GGUF')
$adapter=Join-Path $source 'custom_nodes\DyanariQwen';New-Item -ItemType Directory -Force -Path $adapter|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'image-runtime\dyanari_qwen_node.py') -Destination (Join-Path $adapter '__init__.py') -Force
$uvZip=Join-Path $Cache 'uv.zip';Fetch 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-pc-windows-msvc.zip' $uvZip 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f'
Expand-Archive -LiteralPath $uvZip -DestinationPath (Join-Path $root 'uv') -Force
$envRoot=Join-Path $root 'environment';New-Item -ItemType Directory -Force -Path $envRoot|Out-Null
foreach($name in @('pyproject.toml','uv.lock')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('image-runtime\'+$name)) -Destination (Join-Path $envRoot $name) -Force}
$uv=Join-Path $root 'uv\uv.exe';$sync=@('sync','--frozen','--project',$envRoot,'--python','cpython-3.11.13-windows-x86_64')
if($Cpu){$sync+=@('--no-group','cuda','--group','cpu')}
& $uv @sync;if($LASTEXITCODE){throw 'Pinned image runtime dependency setup failed'}
if(!$Cpu){& (Join-Path $envRoot '.venv\Scripts\python.exe') -c "import torch; assert torch.cuda.is_available(), 'NVIDIA CUDA is not ready for the pinned runtime. Use a compatible driver or explicitly choose CPU setup.'";if($LASTEXITCODE){throw 'CUDA readiness check failed before downloading image weights'}}
$needed=[long]$bundle.bytes+3GB;if((New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($root))).AvailableFreeSpace -lt $needed){throw 'Insufficient disk space for selected image bundle'}
foreach($file in $bundle.files){
 if($file.folder -notin @('diffusion_models','text_encoders','vae') -or $file.name -notmatch '^[A-Za-z0-9._-]+$' -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.revision -notmatch '^[a-f0-9]{40}$'){throw 'Invalid pinned model catalog entry'}
 $folder=Join-Path $source ('models\'+$file.folder);New-Item -ItemType Directory -Force -Path $folder|Out-Null
 Fetch ('https://huggingface.co/'+$file.repo+'/resolve/'+$file.revision+'/'+$file.path) (Join-Path $folder $file.name) $file.sha256 $file.bytes
}
$device=if($Cpu){'cpu'}else{'cuda'}
Fetch $catalog.licenseDocument.url (Join-Path $source 'models\QWEN-RESEARCH-LICENSE.txt') $catalog.licenseDocument.sha256 $catalog.licenseDocument.bytes
@{schema=1;bundle=$bundle.id;device=$device;comfyRevision=$catalog.comfy.revision;ggufRevision=$catalog.gguf.revision;researchTermsAccepted=$true;installed=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $root 'INSTALL.json')
Write-Output ('Verified image runtime and complete bundle installed: '+$bundle.name)
