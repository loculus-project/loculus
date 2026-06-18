#!/usr/bin/env python3

"""Seed a local Loculus database with the canonical config fixtures.

Under the DB-backed config architecture (see ``config-architecture/``) the
domain config — instance branding, organisms, and the opaque per-pipeline
preprocessing config files — lives in the ``config_*`` tables and is seeded for
previews and CI by the ``loculus-config-loader`` running ``kubernetes/loculus/
fixtures/`` against the admin API.

This script is the lightweight, backend-free equivalent for local development:
it reads the same ``kubernetes/loculus/fixtures/`` directory and writes the rows
directly into Postgres via ``psql``/``kubectl``/``docker``. The result matches
what the loader produces, so a locally-seeded preview behaves exactly like a
CI/preview deployment — all organisms, instance branding (logo, banners, …),
and preprocessing config files visible in the admin panel.

The fixtures are already in the canonical schema, so no per-field merging or
display-name copying is needed (unlike the legacy ``backend_config.json`` path
this replaced).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FIXTURES_DIR = REPO_ROOT / "kubernetes" / "loculus" / "fixtures"
LOCALHOST_NAMES = {"localhost", "127.0.0.1", "::1"}

# values.yaml organism-override constructs that linger in the migrated fixtures
# but are NOT part of the canonical/backend `Schema`. The config-loader posts
# fixtures through the canonical Zod schema, which silently strips unknown keys;
# this SQL-direct importer must drop them too, otherwise the backend's
# (fail-on-unknown) Jackson deserializer 500s when it reads the organism config.
NON_CANONICAL_SCHEMA_KEYS = {"extraInputFields", "metadataAdd"}


def clean_organism_config(organism_config: dict) -> dict:
    schema = organism_config.get("schema")
    if isinstance(schema, dict):
        for key in NON_CANONICAL_SCHEMA_KEYS:
            schema.pop(key, None)
    return organism_config


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def load_yaml(path: Path) -> dict:
    with path.open() as file:
        return yaml.safe_load(file)


def load_fixtures(fixtures_dir: Path) -> tuple[dict, dict[str, dict], dict[str, dict[int, str]]]:
    """Read instance.yaml, organisms/*.yaml, and preprocessing/<org>/<ver>.<ext>.

    Mirrors ``config-tools/src/loader/fixtures.ts``: the organism key is the
    file stem, the organism config is the whole file, and preprocessing config
    files are stored verbatim keyed by (organism, pipeline version).
    """
    instance_path = fixtures_dir / "instance.yaml"
    if not instance_path.is_file():
        raise SystemExit(f"Instance fixture not found: {instance_path}")
    instance_config = load_yaml(instance_path)

    organisms: dict[str, dict] = {}
    organisms_dir = fixtures_dir / "organisms"
    if organisms_dir.is_dir():
        for path in sorted(organisms_dir.glob("*.y*ml")):
            organisms[path.stem] = clean_organism_config(load_yaml(path))
    if not organisms:
        raise SystemExit(f"No organism fixtures found under {organisms_dir}")

    preprocessing: dict[str, dict[int, str]] = {}
    preprocessing_dir = fixtures_dir / "preprocessing"
    if preprocessing_dir.is_dir():
        for organism_dir in sorted(p for p in preprocessing_dir.iterdir() if p.is_dir()):
            by_version: dict[int, str] = {}
            for path in sorted(organism_dir.iterdir()):
                if not path.is_file():
                    continue
                try:
                    version = int(path.stem)
                except ValueError as error:
                    raise SystemExit(
                        f"Invalid preprocessing config filename '{path.name}' in "
                        f"{organism_dir.name}: the stem must be a positive integer "
                        "pipeline version (e.g. '1.yaml')."
                    ) from error
                by_version[version] = path.read_text()
            if by_version:
                preprocessing[organism_dir.name] = by_version

    return instance_config, organisms, preprocessing


def build_sql(
    instance_config: dict,
    organisms: dict[str, dict],
    preprocessing: dict[str, dict[int, str]],
) -> str:
    statements = [
        "BEGIN;",
        "SET CONSTRAINTS ALL DEFERRED;",
        "DELETE FROM config_preprocessing_files;",
        "DELETE FROM config_audit_log;",
        "DELETE FROM config_instance_draft;",
        "DELETE FROM config_organism_drafts;",
        "DELETE FROM config_organism_versions;",
        "DELETE FROM config_organisms;",
        "DELETE FROM config_instance_state;",
        "DELETE FROM config_instance_versions;",
        "DELETE FROM current_processing_pipeline;",
        "INSERT INTO config_instance_versions (version, config, published_at, published_by) "
        f"VALUES (1, {sql_literal(json.dumps(instance_config, separators=(',', ':')))}::jsonb, now(), 'local-import');",
        "INSERT INTO config_instance_state (singleton, current_version) VALUES (TRUE, 1);",
    ]

    for key, organism_config in sorted(organisms.items()):
        key_literal = sql_literal(key)
        config_literal = sql_literal(json.dumps(organism_config, separators=(",", ":")))
        statements.extend(
            [
                "INSERT INTO config_organisms "
                "(key, status, current_version, created_at, created_by, first_published_at, last_published_at) "
                f"VALUES ({key_literal}, 'released', 1, now(), 'local-import', now(), now());",
                "INSERT INTO config_organism_versions "
                "(organism_key, version, config, published_at, published_by) "
                f"VALUES ({key_literal}, 1, {config_literal}::jsonb, now(), 'local-import');",
                # The backend always starts an organism at pipeline version 1 and
                # auto-upgrades once a newer pipeline has processed everything
                # (CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist).
                "INSERT INTO current_processing_pipeline (organism, version, started_using_at) "
                f"VALUES ({key_literal}, 1, now());",
            ],
        )

    for organism_key, by_version in sorted(preprocessing.items()):
        if organism_key not in organisms:
            # A preprocessing fixture without a matching organism would violate
            # the foreign key; skip it rather than fail the whole import.
            continue
        for version, content in sorted(by_version.items()):
            statements.append(
                "INSERT INTO config_preprocessing_files "
                "(organism_key, pipeline_version, config_file, updated_at, updated_by) "
                f"VALUES ({sql_literal(organism_key)}, {version}, {sql_literal(content)}, now(), 'local-import');",
            )

    statements.append("COMMIT;")
    return "\n".join(statements) + "\n"


def psql_args(args: argparse.Namespace) -> list[str]:
    return [
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        args.user,
        "-d",
        args.database,
    ]


def candidate_commands(args: argparse.Namespace) -> list[list[str]]:
    commands = []
    if shutil.which("psql") is not None:
        commands.append(
            psql_args(args)
            + [
                "-h",
                args.host,
                "-p",
                args.port,
            ],
        )

    if shutil.which("kubectl") is not None:
        commands.append(
            [
                "kubectl",
                "exec",
                "-i",
                "-n",
                args.kube_namespace,
                "deployment/loculus-database",
                "--",
                "env",
                f"PGPASSWORD={args.password}",
            ]
            + psql_args(args),
        )

    if shutil.which("docker") is not None:
        commands.append(
            [
                "docker",
                "exec",
                "-i",
                "-e",
                f"PGPASSWORD={args.password}",
                args.docker_container,
            ]
            + psql_args(args),
        )
        host = "host.docker.internal" if args.host in LOCALHOST_NAMES else args.host
        commands.append(
            [
                "docker",
                "run",
                "--rm",
                "-i",
                "-e",
                f"PGPASSWORD={args.password}",
                "--add-host=host.docker.internal:host-gateway",
                args.postgres_image,
            ]
            + psql_args(args)
            + [
                "-h",
                host,
                "-p",
                args.port,
            ],
        )

    return commands


def run_sql(args: argparse.Namespace, sql: str) -> None:
    env = os.environ.copy()
    env["PGPASSWORD"] = args.password
    errors = []

    for command in candidate_commands(args):
        result = subprocess.run(command, input=sql, text=True, capture_output=True, env=env)
        if result.returncode == 0:
            return
        errors.append(f"$ {' '.join(command[:8])} ...\n{result.stderr.strip()}")

    if not errors:
        raise SystemExit("Neither psql, kubectl nor docker was found. Install psql or run the dev cluster/container.")

    raise SystemExit(
        "Could not import the config into Postgres. Tried local psql, Kubernetes, and Docker fallbacks.\n\n"
        + "\n\n".join(errors),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed the DB-backed config tables from kubernetes/loculus/fixtures/ for local previews.",
    )
    parser.add_argument(
        "--fixtures",
        default=str(DEFAULT_FIXTURES_DIR),
        help="Path to the canonical config fixtures directory (instance.yaml + organisms/ + preprocessing/).",
    )
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", default="5432")
    parser.add_argument("--database", default="loculus")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", default=os.environ.get("PGPASSWORD", "unsecure"))
    parser.add_argument("--docker-container", default="loculus_postgres")
    parser.add_argument("--postgres-image", default="postgres:15.12")
    parser.add_argument("--kube-namespace", default="default")
    parser.add_argument("--dry-run", action="store_true", help="Print SQL instead of executing it.")
    args = parser.parse_args()

    fixtures_dir = Path(args.fixtures)
    if not fixtures_dir.is_dir():
        raise SystemExit(f"Fixtures directory not found: {fixtures_dir}")

    instance_config, organisms, preprocessing = load_fixtures(fixtures_dir)
    sql = build_sql(instance_config, organisms, preprocessing)
    if args.dry_run:
        print(sql)
        return

    run_sql(args, sql)
    preprocessing_count = sum(len(v) for v in preprocessing.values())
    print(
        f"Imported {len(organisms)} organisms and {preprocessing_count} preprocessing "
        f"config files from {fixtures_dir}. Restart the backend if it was running."
    )


if __name__ == "__main__":
    main()
