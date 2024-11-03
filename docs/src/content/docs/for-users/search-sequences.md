---
title: Search sequences
---

## Mutations

### Nucleotide mutations and insertions

A nucleotide mutation has the format `<position><base>` or `<base_ref><position><base>`. A `<base>` can be one of the four nucleotides `A`, `T`, `C`, and `G`. It can also be `-` for deletion and `N` for unknown. For example if the reference sequence is `A` at position 23 both: `23T` and `A23T` will yield the same results.

If your organism is multi-segmented you must append the name of the segment to the start of the mutation, e.g. `S:23T` and `S:A23T` for a mutation in segment `S`.

Insertions can be searched for in the same manner, they just need to have `ins_` appended to the start of the mutation. Example `ins_10462:A` or if the organism is multi-segmented `ins_S:10462:A`.

### Amino acid mutations and insertions

An amino acid mutation has the format `<gene>:<position><base>` of `<gene>:<base_ref><position><base>`. A `<base>` can be one of the 20 amino acid codes. It can also be `-` for deletion and `X` for unknown. Example: `E:57Q`.

Insertions can be searched for in the same manner, they just need to have `ins_` appended to the start of the mutation. Example `ins_NS4B:31:N`.

### Insertion wildcards

Loculus supports insertion queries that contain wildcards `?`. For example `ins_S:214:?EP?` will match all cases where segment `S` has an insertion of `EP` between the positions 214 and 215 but also an insertion of other AAs which include the `EP`, e.g. the insertion `EPE` will be matched.

You can also use wildcards to match any insertion at a given position. For example `ins_S:214:?:` will match any (but at least one) insertion between the positions 214 and 215.

### Multiple mutations

Multiple mutation filters can be provided by adding one mutation after the other.

### Any mutation

To filter for any mutation at a given position you can omit the `<base>`.
