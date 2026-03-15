---
title: Search sequences
---

## Mutations

### Nucleotide mutations and insertions

A nucleotide mutation has the format `<position><base>` or `<base_ref><position><base>`. A `<base>` can be one of the four nucleotides `A`, `T`, `C`, and `G`. It can also be `-` for deletion and `N` for unknown. For example if the reference sequence is `A` at position 23 both: `23T` and `A23T` will yield the same results.

Insertions can be searched for in the same manner, they just need to have `ins_` appended to the start of the mutation. Example `ins_10462:A`.

### Amino acid mutations and insertions

An amino acid mutation has the format `<gene>:<position><base>` of `<gene>:<base_ref><position><base>`. A `<base>` can be one of the 20 amino acid codes. It can also be `-` for deletion and `X` for unknown. Example: `E:57Q`.

Insertions can be searched for in the same manner, they just need to have `ins_` appended to the start of the mutation. Example `ins_NS4B:31:N`.

### Insertion wildcards

Loculus supports insertion queries that contain wildcards `?`. For example `ins_G:214:?EP?` will match all cases where gene `G` has an insertion of `EP` between the positions 214 and 215 but also an insertion of other AAs which include the `EP`, e.g. the insertion `EPE` will be matched.

You can also use wildcards to match any insertion at a given position. For example `ins_G:214:?` will match any (but at least one) insertion between the positions 214 and 215.

### Multiple mutations

Multiple mutation filters can be provided by adding one mutation after the other.

### Any mutation

To filter for any mutation at a given position you can omit the `<base>`.

## Date ranges

Dates like the collection date of a sequence can't always be exactly given as a single day, but are sometimes only known as a date range ("This sequence was collected sometime during this week"). When searching sequences by collection date, there are two approaches when searching for sequences that fall into a particular range: Look for complete overlap or partial overlap.

![Comparison of strict and not strict range overlap.](/images/strict_not_strict.drawio.svg)

The graphic above illustrates this, in Loculus these two modes are called "strict" and "not strict". Strict means, that the range of the date of the sequences must wholly be contained in the search range. Not strict means that a partial overlap is sufficient.
