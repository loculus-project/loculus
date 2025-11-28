---
title: FASTA format
---

The [_FASTA_](https://en.wikipedia.org/wiki/FASTA_format) format is a standard way to store sequence data along with optional metadata. Loculus provides sequence data in FASTA files and expects FASTA-formatted input when sequences are submitted.

Each sequence entry begins with a metadata line starting with the `>` character. For example:

```
>TTKC257461 2021-05-12, Congo
TTATGCTTCGTAAAATGTAGGTCTTGAACCAAACATTCTTTGAAAAAATGAGATGCATAA
AACTTTATTATCCAATAGATTAACTATTTCAGACGTCAATCGTTTAAAGTAAACTTCGTA
```

The text immediately following `>` and extending to the first space (or the end of the line) is the _ID_ of the sequence or segment. In the example above, the ID is `TTKC257461`.

For isolates composed of multiple segments, Loculus requires one metadata entry per sample, and every segment must appear as a separate sequence in the uploaded FASTA file.

The metadata file should include a field named `fastaID`, containing a space-separated list of all FASTA IDs associated with that sample. For example, if the following three sequences correspond to the metadata entry NIPAK-sample, the fastaID should be:

```
test_NIHPAK-19_L test_NIHPAK-19_M test_NIHPAK-19_S
```
Example sequences:

```
>test_NIHPAK-19_L
CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGAAGCAGATAAGTCTTCACTACTCATGAGTTTC
>test_NIHPAK-19_M
GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCGGAAGAGCTGTGAAATAGACAGTATC
>test_NIHPAK-19_S
GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNAATGGAGAAAAGACATAGGCTTCCGTGTCA
```

A segment cannot be empty.
