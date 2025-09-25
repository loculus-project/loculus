from __future__ import annotations

import hashlib
import logging
import shutil
from pathlib import Path
from typing import Dict

logger = logging.getLogger(__name__)


def read_text(path: Path, default: str = "0") -> str:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return default
    return text or default


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def md5_file(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_key_value_file(path: Path) -> Dict[str, str]:
    pairs: Dict[str, str] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if "=" not in line:
                continue
            key, value = line.strip().split("=", 1)
            pairs[key] = value
    return pairs


def prune_timestamped_directories(directory: Path, keep: int = 1) -> None:
    if keep < 0:
        raise ValueError("keep must be >= 0")
    if not directory.exists():
        return
    candidates = [p for p in directory.iterdir() if p.is_dir() and p.name.isdigit()]
    if len(candidates) <= keep:
        return
    candidates.sort(key=lambda item: int(item.name), reverse=True)
    for candidate in candidates[keep:]:
        try:
            shutil.rmtree(candidate)
        except OSError as exc:  # pragma: no cover - non-critical cleanup
            logger.warning("Failed to prune %s: %s", candidate, exc)


def safe_remove(path: Path) -> None:
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    except FileNotFoundError:
        return
    except OSError as exc:  # pragma: no cover
        logger.warning("Failed to remove %s: %s", path, exc)
