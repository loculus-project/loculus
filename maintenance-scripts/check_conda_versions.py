#!/usr/bin/env python3
"""
Check for updates to conda packages in environment.yml files.

NOTE: This is a throwaway script written by Claude, primarily intended for use
by Claude/Codex to simplify looking up latest versions. It is not production
quality code. The output should always be reviewed by humans before making
any version updates.

This script scans all environment.yml files in the repository and checks
whether newer versions are available in conda-forge and bioconda channels.

Requirements:
- micromamba must be installed and available in PATH
- Python 3.6+

Usage:
    python3 maintenance-scripts/check_conda_versions.py
"""

import subprocess
import json
import sys
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional


def version_key(version_str: str) -> tuple:
    """
    Convert a version string into a sortable tuple.
    Handles various version formats including:
    - Standard versions: 1.2.3
    - Post releases: 1.2.3.post0
    - Date-based: 2025.10.26
    - Mixed: 6.0.12.20250915

    Args:
        version_str: Version string to parse

    Returns:
        Tuple that can be used for sorting
    """
    # Split on dots and other separators
    parts = re.split(r'[._-]', version_str.lower())
    result = []

    for part in parts:
        # Try to convert to int if it's purely numeric
        if part.isdigit():
            result.append((0, int(part)))  # 0 = numeric, for sorting priority
        elif part == 'post':
            result.append((1, 0, 0))  # post marker
        elif part.startswith('post'):
            # Handle 'post0', 'post1', etc.
            num = part[4:]
            if num.isdigit():
                result.append((1, 0, int(num)))
            else:
                result.append((2, part))  # fallback to string
        else:
            # String part (like 'rc', 'alpha', 'beta')
            result.append((2, part))

    return tuple(result)


def is_prerelease(version_str: str) -> bool:
    """
    Check if a version string is a pre-release (alpha, beta, rc, dev).

    Args:
        version_str: Version string to check

    Returns:
        True if it's a pre-release version
    """
    prerelease_markers = ['rc', 'alpha', 'beta', 'dev', 'pre']
    version_lower = version_str.lower()
    return any(marker in version_lower for marker in prerelease_markers)


def get_latest_version(package_name: str, include_prerelease: bool = False) -> Optional[str]:
    """
    Get the latest version of a conda package from conda-forge and bioconda.

    Args:
        package_name: Name of the package to check
        include_prerelease: Whether to include pre-release versions (alpha, beta, rc, dev)

    Returns:
        Latest version string, or None if not found
    """
    try:
        result = subprocess.run(
            ['micromamba', 'search', '-c', 'conda-forge', '-c', 'bioconda',
             package_name, '--json'],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return None

        data = json.loads(result.stdout)
        pkgs = data.get('result', {}).get('pkgs', [])

        if not pkgs:
            return None

        # Get unique versions
        all_versions = set(p['version'] for p in pkgs)

        # Filter out pre-releases unless requested
        if not include_prerelease:
            all_versions = [v for v in all_versions if not is_prerelease(v)]

        if not all_versions:
            return None

        # Sort versions and get the latest
        versions = sorted(all_versions, key=version_key)

        return versions[-1] if versions else None

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        print(f"Warning: Error checking {package_name}: {e}", file=sys.stderr)
        return None


def parse_environment_file(filepath: Path) -> List[Tuple[str, str]]:
    """
    Parse an environment.yml file and extract pinned package versions.

    Args:
        filepath: Path to environment.yml file

    Returns:
        List of (package_name, version) tuples
    """
    packages = []
    in_dependencies = False

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()

            if line.startswith('dependencies:'):
                in_dependencies = True
                continue

            if not in_dependencies or not line.startswith('- '):
                continue

            # Remove leading '- ' and any comments
            pkg_spec = line[2:].split('#')[0].strip()

            # Skip pip, python, and packages without version pins
            if not pkg_spec or pkg_spec == 'pip:':
                continue

            # Parse package specification
            if '=' in pkg_spec:
                parts = pkg_spec.split('=')
                pkg_name = parts[0].strip()
                # Handle cases like "pkg=1.0=build_string"
                version = parts[1].split('=')[0].strip()

                # Remove >= or other operators that might be present
                if version.startswith('>='):
                    version = version[2:].strip()

                packages.append((pkg_name, version))

    return packages


def check_updates():
    """Main function to check for conda package updates."""

    # Find all environment.yml files
    repo_root = Path(__file__).parent.parent
    env_files = [
        repo_root / 'preprocessing/nextclade/environment.yml',
        repo_root / 'ingest/environment.yml',
        repo_root / 'ena-submission/environment.yml',
    ]

    # Filter to only existing files
    env_files = [f for f in env_files if f.exists()]

    if not env_files:
        print("No environment.yml files found!")
        return

    print("Conda Package Version Check")
    print("=" * 80)
    print()

    has_updates = False

    for env_file in env_files:
        packages = parse_environment_file(env_file)

        if not packages:
            continue

        print(f"{env_file.relative_to(repo_root)}:")
        print("-" * 80)

        updates_found = False

        for pkg_name, current_version in sorted(packages):
            latest_version = get_latest_version(pkg_name)

            if latest_version is None:
                print(f"  ⚠️  {pkg_name:30} current: {current_version:20} (couldn't check)")
                continue

            if latest_version != current_version:
                print(f"  ⬆️  {pkg_name:30} {current_version:20} → {latest_version}")
                updates_found = True
                has_updates = True
            else:
                print(f"  ✓  {pkg_name:30} {current_version:20} (up to date)")

        if not updates_found:
            print("  All packages are up to date!")

        print()

    if has_updates:
        print("=" * 80)
        print("Updates are available! Review the changes above and update")
        print("the environment.yml files accordingly.")
        print()
        print("Remember to:")
        print("  1. Update all three environment.yml files")
        print("  2. Update .pre-commit-config.yaml if ruff changed")
        print("  3. Run: pre-commit run --all-files")
    else:
        print("=" * 80)
        print("All packages are up to date!")


if __name__ == '__main__':
    try:
        check_updates()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user", file=sys.stderr)
        sys.exit(1)
