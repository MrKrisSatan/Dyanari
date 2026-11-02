param([string]$Cache='', [switch]$DownloadVoiceModel, [switch]$AcceptNoncommercialTerms, [string]$Data='')
$ErrorActionPreference='Stop'
# Independent upstream service, pinned source and locked dependencies. No global Python/package changes.
$root=Join-Path $env:USERPROFILE '.dyanari\voicestudio'
if(!$Cache){$Cache=Join-Path $root 'downloads'}
if(!$Data){$Data=if($env:DYANARI_DATA){$env:DYANARI_DATA}else{Join-Path $PSScriptRoot 'data'}}
foreach($dir in @($root,$Cache)){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
function Fetch($url,$name,$hash){$dest=Join-Path $Cache $name;if(!(Test-Path -LiteralPath $dest) -or (Get-FileHash -LiteralPath $dest).Hash -ne $hash){Invoke-WebRequest $url -UseBasicParsing -OutFile ($dest+'.partial');if((Get-FileHash -LiteralPath ($dest+'.partial')).Hash -ne $hash){throw "Integrity check failed: $name"};Move-Item -LiteralPath ($dest+'.partial') -Destination $dest -Force};return $dest}
$source=Join-Path $root 'source'
if(!(Test-Path -LiteralPath (Join-Path $source 'pyproject.toml'))){
 $zip=Fetch 'https://codeload.github.com/debpalash/VoiceStudio/zip/5bfbda36886e8555317eb2f5816784ccad28f42c' 'voicestudio-source.zip' '54b4cc5826a7c3a6035556cc593d38863c7f84fcbb1da06e7d95ffb2b263c46b'
 Expand-Archive -LiteralPath $zip -DestinationPath $root -Force
 $expanded=[IO.Path]::GetFullPath((Join-Path $root 'VoiceStudio-5bfbda36886e8555317eb2f5816784ccad28f42c'))
 if(!(Split-Path $expanded -Parent).Equals([IO.Path]::GetFullPath($root),[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid extraction path'}
 Move-Item -LiteralPath $expanded -Destination $source
}
$uvZip=Fetch 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-pc-windows-msvc.zip' 'uv.zip' 'a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f'
Expand-Archive -LiteralPath $uvZip -DestinationPath (Join-Path $root 'uv') -Force
$uv=Join-Path $root 'uv\uv.exe'
& $uv sync --locked --no-group cuda --group cpu --project $source
if($LASTEXITCODE){throw 'VoiceStudio dependency setup failed'}
$bunZip=Fetch 'https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-windows-x64.zip' 'bun.zip' 'ce4c17497b2f29712a99d3d53f028de28cd42e3bacb8589599e7f000e49b6405'
Expand-Archive -LiteralPath $bunZip -DestinationPath (Join-Path $root 'bun') -Force
$bun=Join-Path $root 'bun\bun-windows-x64\bun.exe'
$previousPath=$env:PATH
try{
 $env:PATH=(Split-Path $bun)+';'+(Join-Path $PSScriptRoot 'runtime')+';'+$previousPath
 & $bun install --frozen-lockfile --ignore-scripts --cwd $source
 if($LASTEXITCODE){throw 'VoiceStudio web dependencies failed'}
 & $bun run --cwd (Join-Path $source 'electron') build:web
 if($LASTEXITCODE){throw 'VoiceStudio web build failed'}
}finally{$env:PATH=$previousPath}
if($DownloadVoiceModel){
 if(!$AcceptNoncommercialTerms){throw 'Review VOICESTUDIO.md and model/tokenizer terms. Pass -AcceptNoncommercialTerms only if authorised for this personal noncommercial use.'}
 $env:OMNIVOICE_CACHE_DIR=Join-Path $root 'models';$env:HF_HUB_CACHE=$env:OMNIVOICE_CACHE_DIR;$env:HF_HOME=$env:OMNIVOICE_CACHE_DIR;$env:HF_HUB_DISABLE_SYMLINKS='1'
 $env:OMNIVOICE_DATA_DIR=Join-Path $Data 'voicestudio';New-Item -ItemType Directory -Force -Path $env:OMNIVOICE_DATA_DIR|Out-Null
 $env:PYTHONPATH=(Join-Path $source 'backend')+';'+$source
 & (Join-Path $source '.venv\Scripts\python.exe') -c "from huggingface_hub import snapshot_download; snapshot_download('k2-fsa/OmniVoice',revision='c5fdb5ccb189668d56333f77ba2629f4cd7535f4',max_workers=1); snapshot_download('Systran/faster-whisper-base',revision='ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66',max_workers=1); from core.db import init_db; init_db(); from services.model_acceptance import status,accept; [accept(repo,status(repo)['fingerprint']) for repo in ['k2-fsa/OmniVoice','eustlb/higgs-audio-v2-tokenizer']]; print('Pinned voice weights installed; personal noncommercial acceptance saved locally.')"
 if($LASTEXITCODE){throw 'Voice model download/acceptance failed'}
}
@{source='https://github.com/debpalash/VoiceStudio';revision='5bfbda36886e8555317eb2f5816784ccad28f42c';version='0.5.7';device='cpu';voiceModel='k2-fsa/OmniVoice';modelRevision='c5fdb5ccb189668d56333f77ba2629f4cd7535f4';installed=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $root 'INSTALL.json')
Write-Output 'VoiceStudio installed. Enable VoiceStudio in Dyanari, start service, create the voice and preview it. Full studio provides advanced features and optional engines.'
