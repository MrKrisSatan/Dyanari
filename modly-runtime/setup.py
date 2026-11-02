"""Install immutable Modly sources, verified CUDA wheels and complete model files."""
import argparse
from email.parser import Parser
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import site
import re
import subprocess
import sys
import zipfile


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def fetch(url, file, sha, size):
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.is_file() and file.stat().st_size == size and digest(file) == sha:
        return
    print('Downloading ' + file.name, flush=True)
    partial = file.with_name(file.name + '.partial')
    subprocess.run(['curl.exe', '--location', '--fail', '--retry', '3', '--connect-timeout', '20',
                    '--speed-time', '60', '--speed-limit', '1024', '--max-time', '7200',
                    '--silent', '--show-error', '--output', str(partial), url], check=True)
    if partial.stat().st_size != size or digest(partial) != sha:
        raise ValueError('Integrity mismatch: ' + file.name)
    partial.replace(file)


def extract(archive, dest, strip_root=False):
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for member in z.infolist():
            parts = member.filename.replace('\\', '/').split('/')
            if strip_root:
                parts = parts[1:]
            if not parts or parts == ['']:
                continue
            if any(p in ('..', '.') or ':' in p for p in parts) or member.filename.startswith(('/', '\\')) or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive entry')
            target = dest.joinpath(*parts)
            target.resolve().relative_to(dest.resolve())
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(member) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)


def normalize_native_metadata(root, sp):
    """Some upstream wheels use hyphens inside their dist-info name.

    uv/pip interpret that as the name/version separator, breaking repair.
    Normalize only our known native packages, without touching package code.
    """
    known = {'cumesh', 'flex-gemm', 'o-voxel', 'nvdiffrast', 'diso'}
    for folder in sp.glob('*.dist-info'):
        metadata = folder / 'METADATA'
        if not metadata.is_file():
            continue
        parsed = Parser().parsestr(metadata.read_text(encoding='utf-8'))
        name, version = parsed.get('Name', ''), parsed.get('Version', '')
        if name.lower().replace('_', '-') not in known:
            continue
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', name) or not re.fullmatch(r'[A-Za-z0-9_.+-]+', version):
            raise ValueError('Invalid native wheel metadata')
        correct = re.sub(r'[-_.]+', '_', name) + '-' + version + '.dist-info'
        if folder.name == correct:
            continue
        target = sp / correct
        folder.resolve().relative_to(root.resolve())
        target.resolve().relative_to(root.resolve())
        if folder.is_symlink() or target.exists():
            raise ValueError('Conflicting native wheel metadata; choose a fresh private runtime')
        original = folder.name
        folder.rename(target)
        record = target / 'RECORD'
        if record.is_file():
            record.write_text(record.read_text(encoding='utf-8').replace(original + '/', correct + '/'), encoding='utf-8')
        print('Normalized native wheel metadata: ' + correct, flush=True)


def setup(args):
    if not args.accept_model_terms:
        raise ValueError('Model terms acceptance is required')
    root = Path(args.root).resolve()
    if root == Path(root.anchor):
        raise ValueError('Runtime cannot be a drive root')
    cache = Path(args.cache).resolve()
    catalog = json.loads(Path(args.catalog).read_text(encoding='utf-8-sig'))
    bundle = next(b for b in catalog['bundles'] if b['id'] == args.bundle)
    if bundle['id'] == 'hunyuan' and not args.hunyuan_territory_eligible:
        raise ValueError('Hunyuan territorial eligibility / separate rights required')
    if shutil.disk_usage(root).free < bundle['bytes'] + 2 * 1024**3:
        raise ValueError('Insufficient space for the selected complete model')
    needed = ['modly', bundle['extension']]
    needed += {'hunyuan': ['hy3d'], 'tripo': ['triposg'], 'trellis': ['trellisSource', 'gguf']}[bundle['extension']]
    for key in needed:
        source = catalog['sources'][key]
        archive = cache / (key + '.zip')
        fetch(source['url'], archive, source['sha256'], source['bytes'])
        dest = root / 'sources' / key
        marker = dest / '.dyanari-source.json'
        if dest.exists():
            if not marker.is_file() or json.loads(marker.read_text()) != source:
                raise ValueError('Existing source differs from pinned source: ' + str(dest))
        else:
            extract(archive, dest, strip_root=True)
            marker.write_text(json.dumps(source), encoding='utf-8')
    sp = Path(next(p for p in site.getsitepackages() if 'site-packages' in p))
    if bundle['extension'] == 'trellis':
        for lib in ['cumesh', 'flex-gemm', 'o-voxel', 'nvdiffrast']:
            wheel = catalog['wheels'][lib]
            archive = cache / (lib + '.whl')
            fetch(wheel['url'], archive, wheel['sha256'], wheel['bytes'])
            # Upstream CUDA wheels have inconsistent dist-info names; extract only
            # the fully hash-verified wheel into this private frozen environment.
            extract(archive, sp)
        normalize_native_metadata(root, sp)
        for source, dest in [('trellis2_gguf', 'trellis2_gguf'), ('patch', 'trellis2_gguf_patch')]:
            shutil.copytree(root / 'sources' / 'trellisSource' / source, sp / dest, dirs_exist_ok=True)
        shutil.copytree(root / 'sources' / 'gguf', sp.parent / 'ComfyUI-GGUF', dirs_exist_ok=True)
        spec = importlib.util.spec_from_file_location('modly_trellis_setup', root / 'sources' / 'trellis' / 'setup.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module._patch_gguf_fallback_linear(sp)
        module._apply_patches(sp, sp / 'trellis2_gguf_patch')
        module._patch_o_voxel_tiled_fdg(sp)
        subprocess.run([sys.executable, '-c', 'import torch, cumesh, flex_gemm, o_voxel, nvdiffrast, triton'], check=True)
    elif bundle['extension'] in ('tripo', 'hunyuan'):
        wheel = catalog['wheels']['diso']
        archive = cache / 'diso.whl'
        fetch(wheel['url'], archive, wheel['sha256'], wheel['bytes'])
        extract(archive, sp)
        normalize_native_metadata(root, sp)
        subprocess.run([sys.executable, '-c', 'import torch, diso'], check=True)
    background = catalog['background']
    fetch(background['url'], root / 'background' / 'u2net.onnx', background['sha256'], background['bytes'])
    for key in bundle.get('licenseDocuments', []):
        document = catalog['licenseDocuments'][key]
        fetch(document['url'], root / 'models' / bundle['id'] / ('LICENSE-' + key + '.txt'), document['sha256'], document['bytes'])
    for file in bundle['files']:
        relative = Path(file['path'])
        if relative.is_absolute() or '..' in relative.parts or ':' in str(relative):
            raise ValueError('Invalid model catalog path')
        fetch('https://huggingface.co/' + bundle['repo'] + '/resolve/' + bundle['revision'] + '/' + file['path'],
              root / 'models' / bundle['id'] / relative, file['sha256'], file['bytes'])
    marker = {'schema': 1, 'revision': bundle['revision'], 'source': catalog['sources']['modly']['revision'],
              'acceptedTerms': True, 'hunyuanTerritoryEligible': args.hunyuan_territory_eligible}
    temp = root / (bundle['id'] + '.json.partial')
    temp.write_text(json.dumps(marker), encoding='utf-8')
    temp.replace(root / (bundle['id'] + '.json'))
    print('Verified local 3D bundle installed: ' + bundle['name'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for field in ['root', 'catalog', 'bundle', 'cache']:
        parser.add_argument('--' + field, required=True)
    parser.add_argument('--accept-model-terms', action='store_true')
    parser.add_argument('--hunyuan-territory-eligible', action='store_true')
    parser.add_argument('--repair-native-metadata', action='store_true')
    args = parser.parse_args()
    if args.repair_native_metadata:
        sp = Path(next(p for p in site.getsitepackages() if 'site-packages' in p))
        normalize_native_metadata(Path(args.root), sp)
    else:
        setup(args)
