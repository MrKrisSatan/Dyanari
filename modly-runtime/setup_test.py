"""Stdlib-only installer regression tests; no downloads or model execution."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('modly_setup', Path(__file__).with_name('setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class InstallerChecks(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='dyanari-modly-setup-')).resolve()

    def test_archive_traversal_rejected(self):
        archive = self.root / 'bad.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('../escape.py', 'bad')
        with self.assertRaises(ValueError):
            setup.extract(archive, self.root / 'destination')
        self.assertFalse((self.root / 'escape.py').exists())

    def test_pinned_source_root_extraction(self):
        archive = self.root / 'source.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('source-sha/pkg/file.py', 'verified source fixture')
        setup.extract(archive, self.root / 'source', strip_root=True)
        self.assertEqual((self.root / 'source/pkg/file.py').read_text(), 'verified source fixture')

    def test_completed_verified_download_is_reused(self):
        file = self.root / 'model.fixture'
        file.write_bytes(b'verified bytes')
        sha = hashlib.sha256(file.read_bytes()).hexdigest()
        with patch.object(setup.subprocess, 'run', side_effect=AssertionError('network must not run')):
            setup.fetch('https://example.invalid/model', file, sha, file.stat().st_size)

    def test_corrupted_download_cannot_be_reused(self):
        file = self.root / 'model.fixture'
        file.write_bytes(b'corrupt')
        with patch.object(setup.subprocess, 'run', side_effect=RuntimeError('retry required')) as run:
            with self.assertRaisesRegex(RuntimeError, 'retry required'):
                setup.fetch('https://example.invalid/model', file, '0' * 64, 7)
            run.assert_called_once()

    def test_native_metadata_repair_and_second_pass(self):
        sp = self.root / 'site-packages'
        bad = sp / 'flex-gemm-1.0.0+cu128torch2.9.dist-info'
        bad.mkdir(parents=True)
        (bad / 'METADATA').write_text('Name: flex-gemm\nVersion: 1.0.0+cu128torch2.9\n')
        (bad / 'RECORD').write_text(bad.name + '/METADATA,,\nflex_gemm/__init__.py,,\n')
        setup.normalize_native_metadata(self.root, sp)
        good = sp / 'flex_gemm-1.0.0+cu128torch2.9.dist-info'
        self.assertTrue(good.is_dir())
        self.assertFalse(bad.exists())
        self.assertIn(good.name + '/METADATA', (good / 'RECORD').read_text())
        setup.normalize_native_metadata(self.root, sp)
        self.assertTrue(good.is_dir())

    def test_native_metadata_conflict_is_not_overwritten(self):
        sp = self.root / 'site-packages'
        bad = sp / 'o-voxel-0.0.1.dist-info'
        bad.mkdir(parents=True)
        (bad / 'METADATA').write_text('Name: o-voxel\nVersion: 0.0.1\n')
        (sp / 'o_voxel-0.0.1.dist-info').mkdir()
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            setup.normalize_native_metadata(self.root, sp)

    def test_model_terms_and_hunyuan_eligibility_fail_before_download(self):
        catalog = self.root / 'catalog.json'
        catalog.write_text(json.dumps({'bundles': [{'id': 'hunyuan'}]}))
        args = argparse.Namespace(root=str(self.root), catalog=str(catalog), bundle='hunyuan',
                                  cache=str(self.root), accept_model_terms=False,
                                  hunyuan_territory_eligible=False)
        with patch.object(setup, 'fetch', side_effect=AssertionError('must not download')):
            with self.assertRaisesRegex(ValueError, 'terms'):
                setup.setup(args)
            args.accept_model_terms = True
            with self.assertRaisesRegex(ValueError, 'territorial'):
                setup.setup(args)


if __name__ == '__main__':
    unittest.main()
