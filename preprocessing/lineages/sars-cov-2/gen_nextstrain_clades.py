#!/usr/bin/env python3
"""Generate a lineage-definition YAML for SARS-CoV-2 Nextstrain clades from a Nextclade dataset tree.

A clade's parent is the clade of the node above the first node carrying it (walking tree.json's
`clade_membership`), so the hierarchy matches the Nextclade dataset that assigns the clades.
`recombinant` has no parent. The tree hangs recombinant clades (first node's Nextclade_pango starts with X, e.g.
22F = XBB) directly under the root; those get the most recent common ancestor of their parental lineages' clades
instead (parental lineages from pango-designation's alias_key.json, mapped to clades through the tree's
Nextclade_pango, walking up the Pango hierarchy for lineages not in the tree). Output format as gen_pango_lineages.py:
    24A:
      aliases: []
      parents: [23I]

Usage:
    nextclade dataset get --name nextstrain/sars-cov-2/wuhan-hu-1/orfs --output-dir ds
    uv run --with pyyaml --with requests gen_nextstrain_clades.py ds/tree.json --pango pango_lineages.yaml \
        -o nextstrain_clades.yaml
"""
import argparse, collections, json, sys
import requests, yaml

p = argparse.ArgumentParser()
p.add_argument("tree")
p.add_argument("--pango", required=True, help="output of gen_pango_lineages.py")
p.add_argument("--ref", default="master", help="pango-designation ref for alias_key.json")
p.add_argument("-o", "--out", required=True)
a = p.parse_args()

parents = collections.defaultdict(set)
seen = set()
first_pango = {}
pango_clades = collections.defaultdict(collections.Counter)


def walk(node, parent_clade):
    attrs = node.get("node_attrs", {})
    clade = attrs.get("clade_membership", {}).get("value")
    if clade:
        seen.add(clade)
        first_pango.setdefault(clade, attrs.get("Nextclade_pango", {}).get("value") or "")
        pango = attrs.get("Nextclade_pango", {}).get("value")
        if pango:
            pango_clades[pango][clade] += 1
        if parent_clade and parent_clade != clade and clade != "recombinant":
            parents[clade].add(parent_clade)
    for child in node.get("children", []):
        walk(child, clade or parent_clade)


sys.setrecursionlimit(100000)
tree = json.load(open(a.tree))["tree"]
walk(tree, None)
root = tree.get("node_attrs", {}).get("clade_membership", {}).get("value")
pango_defs = yaml.safe_load(open(a.pango))
alias = requests.get(
    f"https://raw.githubusercontent.com/cov-lineages/pango-designation/{a.ref}/pango_designation/alias_key.json",
    timeout=60,
).json()


def clade_of_lineage(lineage):
    """the tree's most common clade for a Pango lineage, else for its nearest ancestor in the tree"""
    todo, seen_l = [lineage.rstrip("*")], set()
    while todo:
        l = todo.pop(0)
        if l in seen_l:
            continue
        seen_l.add(l)
        if pango_clades.get(l):
            return pango_clades[l].most_common(1)[0][0]
        todo += pango_defs.get(l, {}).get("parents", [])
    return None


def ancestors(c):
    out = [c]
    while parents.get(c):
        c = sorted(parents[c])[0]
        out.append(c)
    return out


recombinant_clades = [c for c in seen if c != "recombinant" and first_pango[c].startswith("X") and parents[c] == {root}]
for _ in range(len(recombinant_clades)):  # parental clades may be recombinant clades themselves
    for c in recombinant_clades:
        rec = first_pango[c].split(".")[0]
        parental = alias.get(rec)
        clades = {clade_of_lineage(l) for l in parental} - {None, c} if isinstance(parental, list) else set()
        if not clades:
            continue
        chains = [ancestors(x) for x in clades]
        common = [x for x in chains[0] if all(x in ch for ch in chains[1:])]
        if common:
            parents[c] = {common[0]}
            print(f"{c} ({first_pango[c]} = {' x '.join(parental)}): parental clades {sorted(clades)} -> {common[0]}",
                  file=sys.stderr)
defs = {c: {"aliases": [], "parents": sorted(parents[c])} for c in sorted(seen)}
multi = {c: v["parents"] for c, v in defs.items() if len(v["parents"]) > 1}
roots = [c for c, v in defs.items() if not v["parents"]]
yaml.safe_dump(defs, open(a.out, "w"), sort_keys=True)
print(f"{len(defs)} clades, roots: {roots}, multiple parents: {multi}", file=sys.stderr)
