"""Private one-shot adapter for pinned Modly generators. No public backend server."""
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import shutil
import socket
import sys


def emit(progress, message):
    print(json.dumps({'event': 'progress', 'progress': progress, 'message': message}), flush=True)


def inspect_export(source, folder, size_mm):
    import numpy as np
    import trimesh
    loaded = trimesh.load(str(source), force='scene')
    # Bake scene transforms using Modly's own scene flattening/export helper.
    from routers.export import _to_single_mesh
    mesh = _to_single_mesh(loaded)
    if not len(mesh.faces) or len(mesh.faces) > 12_000_000 or not np.isfinite(mesh.vertices).all():
        raise ValueError('Empty, oversized or non-finite generated mesh')
    original_triangles = int(len(mesh.faces))
    if original_triangles > 1_000_000:
        emit(96, 'Reducing oversized geometry for STL export')
        import pymeshlab
        meshes = pymeshlab.MeshSet()
        meshes.add_mesh(pymeshlab.Mesh(vertex_matrix=mesh.vertices, face_matrix=mesh.faces))
        meshes.meshing_decimation_quadric_edge_collapse(targetfacenum=750_000, preservenormal=True, preserveboundary=True)
        simplified = meshes.current_mesh()
        mesh = trimesh.Trimesh(vertices=simplified.vertex_matrix(), faces=simplified.face_matrix(), process=True)
    if len(mesh.faces) > 4_000_000:
        raise ValueError('Mesh could not be reduced below the STL export bound')
    # Modly GLB uses Y-up; STL convention for a slicer is Z-up.
    mesh.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
    extent = float(max(mesh.extents))
    if not math.isfinite(extent) or extent < 1e-8:
        raise ValueError('Degenerate mesh dimensions')
    mesh.apply_scale(size_mm / extent)
    mesh.apply_translation([-mesh.bounds[0][0], -mesh.bounds[0][1], -mesh.bounds[0][2]])
    mesh.export(str(folder / 'model.stl'), file_type='stl')
    report = {'schema': 1, 'triangles': int(len(mesh.faces)), 'vertices': int(len(mesh.vertices)),
              'watertight': bool(mesh.is_watertight), 'winding_consistent': bool(mesh.is_winding_consistent),
              'extents_mm': [float(n) for n in mesh.extents], 'units': 'mm', 'up_axis': 'Z',
              'original_triangles': original_triangles, 'simplified': original_triangles != len(mesh.faces),
              'print_ready_certified': False}
    (folder / 'report.json').write_text(json.dumps(report), encoding='utf-8')
    if source.resolve() != (folder / 'model.glb').resolve():
        shutil.copyfile(source, folder / 'model.glb')
    return report


def run(request):
    root = Path(request['root']).resolve()
    folder = Path(request['folder']).resolve()
    if not folder.is_dir() or request.get('schema') != 1:
        raise ValueError('Invalid worker request')
    sys.path.insert(0, str(root / 'sources' / 'modly' / 'api'))
    os.environ['MODELS_DIR'] = str(root / 'models')
    os.environ['WORKSPACE_DIR'] = str(folder)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['U2NET_HOME'] = str(root / 'background')
    # Upstream helpers may try first-use network downloads. Fail explicitly.
    def no_network(*args, **kwargs):
        raise RuntimeError('Offline 3D inference: run the approved model setup to obtain missing files')
    socket.socket.connect = no_network
    socket.create_connection = no_network
    import huggingface_hub
    huggingface_hub.snapshot_download = no_network
    huggingface_hub.hf_hub_download = no_network
    catalog = json.loads((Path(__file__).parent.parent / 'modly-catalog.json').read_text(encoding='utf-8-sig'))
    bundle = next(b for b in catalog['bundles'] if b['id'] == request['bundle'])
    if request.get('export_only'):
        # Test-only command-line path: never exposed by the app/API/model tools.
        return inspect_export(Path(request['export_only']), folder, request['size_mm'])
    marker = json.loads((root / (bundle['id'] + '.json')).read_text())
    if marker.get('acceptedTerms') is not True or marker.get('revision') != bundle['revision'] or marker.get('source') != catalog['sources']['modly']['revision']:
        raise ValueError('Complete verified installation and model terms are required')
    if bundle['id'] == 'hunyuan' and marker.get('hunyuanTerritoryEligible') is not True:
        raise ValueError('Hunyuan territorial eligibility or separate rights are required')
    model_dir = root / 'models' / bundle['id']
    ext_dir = root / 'sources' / bundle['extension']
    sys.path.insert(0, str(root / 'sources' / 'hy3d'))
    sys.path.insert(0, str(root / 'sources' / 'triposg'))
    spec = importlib.util.spec_from_file_location('dyanari_modly_generator', ext_dir / 'generator.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    generator = getattr(module, bundle['generator'])(model_dir, folder)
    manifest = json.loads((ext_dir / 'manifest.json').read_text())
    generator.hf_repo = bundle['repo']
    generator.download_check = manifest['nodes'][0].get('download_check', '')
    generator._auto_download = no_network
    if hasattr(generator, '_download_weights'):
        generator._download_weights = no_network
        generator._download_hy3dgen = no_network
    if hasattr(generator, '_ensure_pip_packages'):
        def require_packages(packages):
            import importlib
            for package in packages:
                importlib.import_module(package.replace('-', '_'))
        generator._ensure_pip_packages = require_packages
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 20_000_000
    image_bytes = (folder / 'input.image').read_bytes()
    with Image.open(io.BytesIO(image_bytes)) as image:
        if image.width * image.height > 20_000_000 or image.width < 16 or image.height < 16:
            raise ValueError('Image dimensions must be 16 pixels or more and at most 20 megapixels')
        image.verify()
    # Recent rembg releases default to Bria, whose weights/terms differ.
    # All three adapters use the explicitly provisioned U2Net on CPU instead.
    import rembg
    original_session = rembg.new_session
    rembg.new_session = lambda *a, **kw: original_session('u2net', providers=['CPUExecutionProvider'])
    quality = request['quality']
    params = {'enable_texture': False, 'seed': request['seed']}
    if bundle['extension'] == 'hunyuan':
        params.update(num_inference_steps={'fast': 5, 'balanced': 10, 'high': 20}[quality],
                      octree_resolution={'fast': 256, 'balanced': 380, 'high': 512}[quality], guidance_scale=5.5)
    elif bundle['extension'] == 'tripo':
        params.update(num_inference_steps={'fast': 8, 'balanced': 25, 'high': 50}[quality],
                      guidance_scale=7.0, use_flash_decoder='DiffDMC', faces=-1)
    else:
        params.update(pipeline_type={'fast': '512', 'balanced': '1024', 'high': '1024_cascade'}[quality],
                      gguf_quant=bundle['quant'], remesh_resolution=512,
                      ss_steps=12 if quality == 'fast' else 25, slat_steps=12 if quality == 'fast' else 25)
    try:
        emit(0, 'Loading ' + bundle['name'])
        generator.load()
        result = generator.generate(image_bytes, params, progress_cb=emit)
        report = inspect_export(Path(result), folder, request['size_mm'])
        emit(100, 'Saved STL and inspected geometry')
        return report
    finally:
        generator.unload()


if __name__ == '__main__':
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
        # Windows file sharing excludes setup, byte locking excludes another
        # worker/profile. OS locks release on cancellation/process termination.
        with (Path(request['root']) / 'setup.lock').open('a+b') as guard:
            if guard.tell() == 0:
                guard.write(b'\0')
                guard.flush()
            guard.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(guard.fileno(), msvcrt.LK_NBLCK, 1)
            run(request)
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
