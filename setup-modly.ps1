param([Parameter(Mandatory=$true)][string]$BundleId,[switch]$AcceptModelTerms,[switch]$HunyuanTerritoryEligible,[string]$RuntimeRoot='',[string]$Cache='')
$ErrorActionPreference='Stop'
if(!$AcceptModelTerms){throw 'Review and accept the selected 3D model and auxiliary licences first.'}
$catalog=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'modly-catalog.json') -Raw|ConvertFrom-Json
$bundle=@($catalog.bundles|Where-Object id -eq $BundleId);if($bundle.Count -ne 1){throw 'Unknown pinned 3D model'};$bundle=$bundle[0]
if($bundle.id -eq 'hunyuan' -and !$HunyuanTerritoryEligible){throw 'The Hunyuan licence excludes the UK, EU and South Korea. Confirm territorial eligibility or separately obtained rights; ordinary terms acceptance is insufficient.'}
if(!$RuntimeRoot){$RuntimeRoot=if($env:DYANARI_MODLY_HOME){$env:DYANARI_MODLY_HOME}else{Join-Path $env:USERPROFILE '.dyanari\modly'}}
$root=[IO.Path]::GetFullPath($RuntimeRoot);if($root.TrimEnd('\') -eq [IO.Path]::GetPathRoot($root).TrimEnd('\')){throw 'Choose a 3D runtime subfolder, not a drive root'}
New-Item -ItemType Directory -Force -Path $root|Out-Null
try{$setupGuard=[IO.File]::Open((Join-Path $root 'setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Another Dyanari 3D worker or setup is using this runtime'}
try {
if(!$Cache){$Cache=Join-Path $root 'downloads'};New-Item -ItemType Directory -Force -Path $Cache|Out-Null
$uvZip=Join-Path $Cache 'uv.zip'
if(!(Test-Path -LiteralPath $uvZip) -or (Get-FileHash -LiteralPath $uvZip).Hash -ne 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f'){
 & curl.exe --location --fail --retry 3 --connect-timeout 20 --speed-time 60 --speed-limit 1024 --silent --show-error --output ($uvZip+'.partial') 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-pc-windows-msvc.zip'
 if($LASTEXITCODE -or (Get-FileHash -LiteralPath ($uvZip+'.partial')).Hash -ne 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f'){throw '3D setup uv download failed integrity verification'}
 Move-Item -LiteralPath ($uvZip+'.partial') -Destination $uvZip -Force
}
Expand-Archive -LiteralPath $uvZip -DestinationPath (Join-Path $root 'uv') -Force
$uv=Join-Path $root 'uv\uv.exe';$environment=Join-Path $root ('environments\'+$bundle.environment);New-Item -ItemType Directory -Force -Path $environment|Out-Null
foreach($name in @('pyproject.toml','uv.lock')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('modly-runtime\'+$bundle.environment+'\'+$name)) -Destination (Join-Path $environment $name) -Force}
$python=Join-Path $environment '.venv\Scripts\python.exe'
if(Test-Path -LiteralPath $python){& $python (Join-Path $PSScriptRoot 'modly-runtime\setup.py') --root $root --catalog (Join-Path $PSScriptRoot 'modly-catalog.json') --bundle $BundleId --cache $Cache --repair-native-metadata;if($LASTEXITCODE){throw 'Native metadata repair failed before frozen environment sync'}}
& $uv --system-certs sync --frozen --project $environment --python cpython-3.11.13-windows-x86_64
if($LASTEXITCODE){throw 'Pinned 3D Python environment setup failed'}
$python=Join-Path $environment '.venv\Scripts\python.exe'
& $python -c "import torch; assert torch.cuda.is_available(), 'This 3D preview requires a compatible NVIDIA CUDA GPU'"
if($LASTEXITCODE){throw 'CUDA readiness check failed before model download'}
$args3d=@((Join-Path $PSScriptRoot 'modly-runtime\setup.py'),'--root',$root,'--catalog',(Join-Path $PSScriptRoot 'modly-catalog.json'),'--bundle',$BundleId,'--cache',$Cache,'--accept-model-terms')
if($HunyuanTerritoryEligible){$args3d+='--hunyuan-territory-eligible'}
& $python @args3d
if($LASTEXITCODE){throw '3D source/native dependencies/model setup failed; consult modly-setup.log'}
} finally {$setupGuard.Dispose()}
