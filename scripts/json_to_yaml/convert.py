#!/usr/bin/env python3
"""Graph store JSON→YAML conversion utility.

This script validates and converts LangGraph checkpoint files from the legacy
JSON format to YAML. It prefers YAML output with two-space indentation and
preserves field ordering by relying on ruamel.yaml.

Features:
    - Works on a graph root (`--root`) or explicit file list (`--files`).
    - Validates data against JSON Schema before writing.
    - Optionally performs schema normalization (`--schema-migrate`).
    - Supports atomic writes, backups, dry-run, and verbose reporting.
    - Emits per-file status and a summary with exit codes.
"""

from __future__ import annotations

import argparse
import dataclasses
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence
from urllib.parse import unquote

from jsonschema import Draft7Validator, ValidationError
from ruamel.yaml import YAML


GRAPH_META = "meta"
GRAPH_NODE = "node"
GRAPH_EDGE = "edge"
GRAPH_VARIABLES = "variables"


SCHEMAS: Dict[str, Dict[str, object]] = {
    GRAPH_META: {
        "type": "object",
        "required": ["name", "version", "updatedAt", "format"],
        "properties": {
            "name": {"type": "string"},
            "version": {"type": "integer"},
            "updatedAt": {"type": "string"},
            "format": {"type": "integer", "enum": [2]},
        },
    },
    GRAPH_NODE: {
        "type": "object",
        "required": ["id", "template"],
        "properties": {
            "id": {"type": "string"},
            "template": {"type": "string"},
            "config": {"type": "object"},
            "state": {"type": "object"},
            "position": {
                "type": "object",
                "properties": {
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                },
            },
        },
    },
    GRAPH_EDGE: {
        "type": "object",
        "required": ["source", "sourceHandle", "target", "targetHandle"],
        "properties": {
            "id": {"type": "string"},
            "source": {"type": "string"},
            "sourceHandle": {"type": "string"},
            "target": {"type": "string"},
            "targetHandle": {"type": "string"},
        },
    },
    GRAPH_VARIABLES: {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["key", "value"],
            "properties": {
                "key": {"type": "string"},
                "value": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
}


YAML_EMITTER = YAML()
YAML_EMITTER.indent(mapping=2, sequence=2, offset=0)
YAML_EMITTER.default_flow_style = False
YAML_EMITTER.representer.sort_base_mapping_type_on_output = False
YAML_EMITTER.width = 10**6


@dataclasses.dataclass
class ConversionTask:
    source: Path
    kind: str
    output_ext: str
    root: Path
    schema_migrate: bool
    verbose: bool
    encoded_id: Optional[str] = None
    data: Optional[object] = None
    yaml_text: Optional[str] = None
    target: Optional[Path] = None

    def derive_target(self) -> Path:
        suffix = self.output_ext if self.output_ext.startswith('.') else f'.{self.output_ext}'
        return self.source.with_suffix(suffix)

    def decode_id(self) -> Optional[str]:
        if self.encoded_id is None:
            return None
        return unquote(self.encoded_id)


class ConversionError(Exception):
    pass


class GraphConverter:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.validators = {kind: Draft7Validator(schema) for kind, schema in SCHEMAS.items()}
        self.failures: List[str] = []
        self.converted = 0
        self.skipped = 0

    def log(self, message: str) -> None:
        if self.args.verbose:
            print(message)

    def warn(self, message: str) -> None:
        print(f"[warn] {message}")

    def error(self, message: str) -> None:
        print(f"[error] {message}")

    def determine_kind(self, path: Path) -> Optional[str]:
        lower = path.name.lower()
        if lower == 'graph.meta.json':
            return GRAPH_META
        if lower == 'variables.json':
            return GRAPH_VARIABLES
        if '/nodes/' in path.as_posix():
            return GRAPH_NODE
        if '/edges/' in path.as_posix():
            return GRAPH_EDGE
        return None

    def collect_tasks(self) -> List[ConversionTask]:
        tasks: List[ConversionTask] = []
        root = Path(self.args.root).resolve() if self.args.root else None

        def add_task(file_path: Path, kind: Optional[str]) -> None:
            if kind is None:
                msg = f"Unknown file type for {file_path}"
                if self.args.strict:
                    raise ConversionError(msg)
                self.warn(msg + " — skipping")
                return
            encoded_id: Optional[str] = None
            if kind in (GRAPH_NODE, GRAPH_EDGE):
                encoded_id = file_path.stem
            task = ConversionTask(
                source=file_path,
                kind=kind,
                output_ext=self.args.output_ext,
                root=root or file_path.parent,
                schema_migrate=self.args.schema_migrate,
                verbose=self.args.verbose,
                encoded_id=encoded_id,
            )
            tasks.append(task)

        if root:
            meta = root / 'graph.meta.json'
            if meta.exists():
                add_task(meta, GRAPH_META)
            nodes_dir = root / 'nodes'
            if nodes_dir.exists():
                for node_file in sorted(nodes_dir.glob('*.json')):
                    add_task(node_file, GRAPH_NODE)
            edges_dir = root / 'edges'
            if edges_dir.exists():
                for edge_file in sorted(edges_dir.glob('*.json')):
                    add_task(edge_file, GRAPH_EDGE)
            variables = root / 'variables.json'
            if variables.exists():
                add_task(variables, GRAPH_VARIABLES)

        if self.args.files:
            for file_str in self.args.files:
                file_path = Path(file_str).resolve()
                if not file_path.exists():
                    raise ConversionError(f"File not found: {file_path}")
                add_task(file_path, self.determine_kind(file_path))

        return tasks

    def load_tasks(self, tasks: Sequence[ConversionTask]) -> None:
        for task in tasks:
            try:
                with task.source.open('r', encoding='utf-8') as fh:
                    task.data = json.load(fh)
            except json.JSONDecodeError as exc:
                raise ConversionError(f"Failed to parse JSON {task.source}: {exc}") from exc

            if task.schema_migrate:
                self.apply_normalization(task)

            validator = self.validators[task.kind]
            errors = sorted(validator.iter_errors(task.data), key=lambda e: e.path)
            if errors:
                formatted = '; '.join(self.format_validation_error(e) for e in errors)
                raise ConversionError(f"Validation failed for {task.source}: {formatted}")

            if task.kind == GRAPH_VARIABLES:
                self.assert_unique_variable_keys(task)

            task.yaml_text = self.render_yaml(task.data)
            task.target = task.derive_target()

    @staticmethod
    def format_validation_error(error: ValidationError) -> str:
        path = '.'.join(str(p) for p in error.absolute_path)
        prefix = f"{path}: " if path else ''
        return f"{prefix}{error.message}"

    def apply_normalization(self, task: ConversionTask) -> None:
        if task.kind == GRAPH_NODE and isinstance(task.data, dict):
            decoded = task.decode_id()
            if decoded:
                task.data['id'] = str(task.data.get('id') or decoded)
        elif task.kind == GRAPH_EDGE and isinstance(task.data, dict):
            decoded = task.decode_id()
            if decoded:
                task.data['id'] = str(task.data.get('id') or decoded)

    @staticmethod
    def assert_unique_variable_keys(task: ConversionTask) -> None:
        seen: Dict[str, int] = {}
        variables = task.data or []
        if not isinstance(variables, list):
            raise ConversionError(f"Variables file is not an array: {task.source}")
        for idx, entry in enumerate(variables):
            if not isinstance(entry, dict):
                raise ConversionError(f"Invalid variable entry at index {idx} in {task.source}")
            key = str(entry.get('key', '')).strip()
            if not key:
                raise ConversionError(f"Variable at index {idx} missing key in {task.source}")
            if key in seen:
                raise ConversionError(
                    f"Duplicate variable key '{key}' in {task.source} (indexes {seen[key]} and {idx})"
                )
            seen[key] = idx

    def cross_validate(self, tasks: Sequence[ConversionTask]) -> None:
        nodes = [task for task in tasks if task.kind == GRAPH_NODE]
        edges = [task for task in tasks if task.kind == GRAPH_EDGE]
        node_ids = {str(task.data.get('id')) for task in nodes if isinstance(task.data, dict)}
        if len(node_ids) != len(nodes):
            raise ConversionError('Duplicate node IDs detected during validation')
        for edge_task in edges:
            data = edge_task.data if isinstance(edge_task.data, dict) else {}
            source = str(data.get('source', '')).strip()
            target = str(data.get('target', '')).strip()
            missing = [n for n in (source, target) if n and n not in node_ids]
            if missing:
                raise ConversionError(
                    f"Edge {edge_task.source} references missing nodes: {', '.join(missing)}"
                )

    @staticmethod
    def render_yaml(data: object) -> str:
        buffer = io.StringIO()
        YAML_EMITTER.dump(data, buffer)
        text = buffer.getvalue()
        if not text.endswith('\n'):
            text += '\n'
        return text

    def process(self) -> int:
        try:
            tasks = self.collect_tasks()
            if not tasks:
                self.warn('No files matched input arguments; nothing to do')
                return 0
            self.load_tasks(tasks)
            if self.args.root:
                self.cross_validate(tasks)
            for task in tasks:
                self.handle_task(task)
        except ConversionError as exc:
            self.error(str(exc))
            return 1
        summary = f"Summary: converted={self.converted}, skipped={self.skipped}, failed={len(self.failures)}"
        print(summary)
        if self.failures:
            for fail in self.failures:
                self.error(fail)
            return 1
        return 0

    def handle_task(self, task: ConversionTask) -> None:
        assert task.yaml_text is not None and task.target is not None
        status_prefix = f"{task.source} -> {task.target}"

        if not self.args.in_place and not (self.args.dry_run or self.args.validate_only):
            print(f"stdout: {task.source}")
            sys.stdout.write(task.yaml_text)
            if not task.yaml_text.endswith('\n'):
                sys.stdout.write('\n')
            self.converted += 1
            return

        if task.target.exists():
            try:
                existing = task.target.read_text(encoding='utf-8')
            except OSError as exc:
                self.failures.append(f"Failed to read existing {task.target}: {exc}")
                return
            if existing == task.yaml_text:
                print(f"skip: {status_prefix} (up-to-date)")
                self.skipped += 1
                return

        if self.args.validate_only or self.args.dry_run:
            print(f"dry-run: {status_prefix}")
            self.skipped += 1
            return

        try:
            self.write_output(task)
        except OSError as exc:
            self.failures.append(f"Failed to write {task.target}: {exc}")
            return
        print(f"ok: {status_prefix}")
        self.converted += 1

    def write_output(self, task: ConversionTask) -> None:
        assert task.yaml_text is not None and task.target is not None
        task.target.parent.mkdir(parents=True, exist_ok=True)

        if self.args.backup and task.source.exists():
            backup = task.source.with_suffix(task.source.suffix + '.bak')
            shutil.copy2(task.source, backup)
            self.log(f"Backup created at {backup}")

        if self.args.atomic:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', delete=False, dir=task.target.parent) as tmp:
                tmp.write(task.yaml_text)
                tmp_path = Path(tmp.name)
            os.replace(tmp_path, task.target)
        else:
            task.target.write_text(task.yaml_text, encoding='utf-8')


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Convert graph store JSON files to YAML')
    parser.add_argument('--root', help='Graph repository root directory')
    parser.add_argument('--files', nargs='*', help='Explicit JSON files to convert')
    parser.add_argument('--output-ext', default='.yaml', help='Output extension (default: .yaml)')
    parser.add_argument('--no-in-place', dest='in_place', action='store_false', default=True)
    parser.add_argument('--backup', action='store_true', help='Create .bak backup of source JSON files')
    parser.add_argument('--dry-run', action='store_true', help='Validate and report without writing files')
    parser.add_argument('--atomic', action='store_true', help='Write via temporary file and atomic rename')
    parser.add_argument('--validate-only', action='store_true', help='Only run validation, no writes')
    parser.add_argument('--schema-migrate', action='store_true', help='Normalize identifiers during conversion')
    parser.add_argument('--strict', action='store_true', help='Fail on unknown file types')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    parser.set_defaults(in_place=True)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if not args.root and not args.files:
        parser.error('Either --root or --files must be provided')

    if not args.in_place and not args.dry_run and not args.validate_only:
        print('[warn] --no-in-place set, conversion results will be printed to stdout')

    converter = GraphConverter(args)
    return converter.process()


if __name__ == '__main__':
    sys.exit(main())
