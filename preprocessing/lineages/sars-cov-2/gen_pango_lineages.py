#!/usr/bin/env python3
"""Generate a SILO lineage-definition YAML for SARS-CoV-2 Pango lineages from cov-lineages/pango-designation.

Output format (same as pathoplexus/silo-lineage-hierarchy-definitions):
    BA.1:
      aliases: [B.1.1.529.1]
      parents: [B.1.1.529]
Parents come from uncompressing the name and dropping the last component; recombinants (X*) get the
parents listed in alias_key.json. Withdrawn lineages (leading '*') are skipped. Any parent that is not
itself designated is still emitted (with its own parents) so the hierarchy is closed.

Usage: uv run --with pyyaml --with requests gen_pango_lineages.py [--ref master] -o pango_lineages.yaml
Tested: 2026-09-28 against pango-designation master (see 07-scale-test-deployment-plan.md).
"""
import argparse, json, sys
import requests, yaml

RAW = "https://raw.githubusercontent.com/cov-lineages/pango-designation/{ref}/{path}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ref", default="master")
    p.add_argument("-o", "--out", required=True)
    a = p.parse_args()
    notes = requests.get(RAW.format(ref=a.ref, path="lineage_notes.txt"), timeout=60).text
    alias = requests.get(RAW.format(ref=a.ref, path="pango_designation/alias_key.json"), timeout=60).json()

    names = []
    for line in notes.splitlines()[1:]:
        n = line.split("\t", 1)[0].strip()
        if n and not n.startswith("*"):
            names.append(n)

    def uncompress(n):
        head, *rest = n.split(".")
        full = alias.get(head)
        if isinstance(full, str) and full:
            return ".".join([full] + rest)
        return n

    def compress(full):
        """shortest alias-prefixed form of an uncompressed name (inverse of uncompress)"""
        best = full
        for k, v in alias.items():
            if isinstance(v, str) and v and full.startswith(v + "."):  # a bare alias key (e.g. "BA") is not a lineage
                cand = k + full[len(v):]
                if len(cand) < len(best):
                    best = cand
        return best

    defs = {}

    def add(n):
        if n in defs:
            return
        head = n.split(".")[0]
        full = uncompress(n)
        parents = []
        if "." in full:
            parent_full = full.rsplit(".", 1)[0]
            parents = [compress(parent_full)]
        elif isinstance(alias.get(head), list):  # recombinant root, e.g. XBB
            parents = [compress(uncompress(x.rstrip("*"))) for x in alias[head]]
        aliases = [full] if full != n else []
        defs[n] = {"aliases": aliases, "parents": parents}
        for par in parents:
            add(par)

    for n in names:
        add(n)
    with open(a.out, "w") as f:
        yaml.safe_dump(dict(sorted(defs.items())), f, sort_keys=False)
    roots = [k for k, v in defs.items() if not v["parents"]]
    print(f"{len(defs)} lineages ({len(names)} designated), roots: {roots}", file=sys.stderr)


if __name__ == "__main__":
    main()
