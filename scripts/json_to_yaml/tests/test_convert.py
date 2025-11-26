import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict
import shutil
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / 'convert.py'


def write_json(base: Path, relative: str, payload: Dict) -> Path:
    target = base / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    return target


def path_exists(path: Path) -> bool:
    return path.exists()


class ConvertTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = Path(tempfile.mkdtemp(prefix='json-to-yaml-'))

    def tearDown(self) -> None:
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def run_converter(self, *args: str) -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(SCRIPT_PATH), *args]
        return subprocess.run(cmd, capture_output=True, text=True, check=False)

    def build_sample_graph(self) -> None:
        write_json(
            self.tmpdir,
            'graph.meta.json',
            {"name": "main", "version": 1, "updatedAt": "2024-01-01T00:00:00Z", "format": 2},
        )
        write_json(
            self.tmpdir,
            'nodes/trigger.json',
            {"id": "trigger", "template": "trigger", "position": {"x": 0, "y": 0}},
        )
        write_json(
            self.tmpdir,
            'nodes/agent.json',
            {"id": "agent", "template": "agent"},
        )
        write_json(
            self.tmpdir,
            'edges/trigger-out__agent-in.json',
            {
                "id": "trigger-out__agent-in",
                "source": "trigger",
                "sourceHandle": "out",
                "target": "agent",
                "targetHandle": "in",
            },
        )
        write_json(
            self.tmpdir,
            'variables.json',
            [{"key": "env", "value": "prod"}],
        )

    def test_root_conversion_creates_yaml(self) -> None:
        self.build_sample_graph()
        result = self.run_converter('--root', str(self.tmpdir))
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        self.assertTrue(path_exists(self.tmpdir / 'graph.meta.yaml'))
        self.assertTrue(path_exists(self.tmpdir / 'nodes' / 'trigger.yaml'))
        self.assertTrue(path_exists(self.tmpdir / 'edges' / 'trigger-out__agent-in.yaml'))
        self.assertTrue(path_exists(self.tmpdir / 'variables.yaml'))

    def test_idempotent_skip(self) -> None:
        self.build_sample_graph()
        first = self.run_converter('--root', str(self.tmpdir))
        self.assertEqual(first.returncode, 0, msg=first.stderr or first.stdout)
        second = self.run_converter('--root', str(self.tmpdir))
        self.assertEqual(second.returncode, 0, msg=second.stderr or second.stdout)
        self.assertIn('skip:', second.stdout)

    def test_dry_run_does_not_create_yaml(self) -> None:
        self.build_sample_graph()
        result = self.run_converter('--root', str(self.tmpdir), '--dry-run')
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        self.assertFalse(path_exists(self.tmpdir / 'graph.meta.yaml'))

    def test_backup_flag_creates_backups_and_is_idempotent(self) -> None:
        self.build_sample_graph()
        meta_json = (self.tmpdir / 'graph.meta.json').read_text(encoding='utf-8')
        trigger_json = (self.tmpdir / 'nodes' / 'trigger.json').read_text(encoding='utf-8')

        first = self.run_converter('--root', str(self.tmpdir), '--backup')
        self.assertEqual(first.returncode, 0, msg=first.stderr or first.stdout)

        meta_backup = self.tmpdir / 'graph.meta.json.bak'
        trigger_backup = self.tmpdir / 'nodes' / 'trigger.json.bak'
        self.assertTrue(path_exists(meta_backup))
        self.assertTrue(path_exists(trigger_backup))
        self.assertEqual(meta_backup.read_text(encoding='utf-8'), meta_json)
        self.assertEqual(trigger_backup.read_text(encoding='utf-8'), trigger_json)

        second = self.run_converter('--root', str(self.tmpdir), '--backup')
        self.assertEqual(second.returncode, 0, msg=second.stderr or second.stdout)
        self.assertIn('skip:', second.stdout)
        self.assertEqual(meta_backup.read_text(encoding='utf-8'), meta_json)
        self.assertEqual(trigger_backup.read_text(encoding='utf-8'), trigger_json)


if __name__ == '__main__':  # pragma: no cover
    unittest.main()
