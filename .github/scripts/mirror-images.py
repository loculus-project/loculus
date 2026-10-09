"""Validate mirror references, or publish new tags with --publish."""

import argparse
import re
import subprocess
from pathlib import Path

REGISTRY = "ghcr.io/loculus-project/mirror"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--publish", action="store_true")
args = parser.parse_args()

images = {}
repositories = {}
for line in Path(".github/mirror-images.txt").read_text().splitlines():
    source = line.partition("#")[0].strip()
    if not source:
        continue
    if not re.fullmatch(r"[\w./:-]+:[\w.-]+", source):
        raise SystemExit(f"Invalid tagged image: {source}")
    name = source.rsplit("/", 1)[-1]
    repository = source.rsplit(":", 1)[0]
    mirror = name.rsplit(":", 1)[0]
    if repositories.setdefault(mirror, repository) != repository:
        raise SystemExit(f"Conflicting upstreams for {mirror}: {repositories[mirror]}, {repository}")
    if name in images:
        raise SystemExit(f"Duplicate destination {name}: {images[name]}, {source}")
    images[name] = source

lines = subprocess.check_output(
    ["git", "grep", "-Ih", "-e", REGISTRY, "-e", "mirrorRegistry"], text=True
)
prefix = re.escape(REGISTRY) + r"|\{\{[^}\n]*\bmirrorRegistry\b[^}\n]*\}\}"
# Only explicit tags are supported, not digest or untagged references.
references = set(re.findall(rf"(?:{prefix})/([\w.-]+:[\w.-]+)", lines))
if missing := references - images.keys():
    raise SystemExit(f"Missing from .github/mirror-images.txt: {', '.join(sorted(missing))}")

for name, source in images.items():
    destination = f"{REGISTRY}/{name}"
    inspect = ["skopeo", "inspect", "--raw"]
    if not args.publish:
        inspect.append("--no-creds")
    result = subprocess.run(
        [*inspect, f"docker://{destination}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    if result.returncode == 0:
        print(f"Already mirrored: {destination}", flush=True)
    elif args.publish:
        if not re.search(r"\b(?:manifest|name) unknown\b", result.stderr.lower()):
            raise SystemExit(f"Cannot inspect {destination}:\n{result.stderr}")
        print(f"Mirror: {source} -> {destination}", flush=True)
        subprocess.run(
            ["skopeo", "copy", "--all", "--preserve-digests", f"docker://{source}",
             f"docker://{destination}"],
            check=True,
        )
    elif name in references:
        raise SystemExit(
            f"{result.stderr}\nMirror {source} and make its package public before updating references."
        )
    else:
        print(f"Validate new source: {source}", flush=True)
        subprocess.run([*inspect, f"docker://{source}"], stdout=subprocess.DEVNULL, check=True)
