---
title: FASTA format
---

[_FASTA_](https://en.wikipedia.org/wiki/FASTA_format) is a file format to store sequence data with some additional metadata.
Loculus provides sequence data for download and expects sequence data in the FASTA format when submitting sequences.

The metadata is given in a line starting with the `>` character. Example:

```
>TTKC257461 2021-05-12, Congo
TTATGCTTCGTAAAATGTAGGTCTTGAACCAAACATTCTTTGAAAAAATGAGATGCATAA
AACTTTATTATCCAATAGATTAACTATTTCAGACGTCAATCGTTTAAAGTAAACTTCGTA
```

The part immediately following the `>` and up to the first space or end of the line is the _ID_ of the sequence or segment that follows this line. In the example above, the ID is `TTKC257461`.

When dealing with multi-segment isolates, Loculus expects all segments to have the same ID, but there is still a separate entry per segment. The segment ID is the `submissionID + '_' + segmentName`, for example:

```
>test_NIHPAK-19_L
CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGAAGCAGATAAGTCTTCACTACTCATGAGTTTC
>test_NIHPAK-19_M
GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCGGAAGAGCTGTGAAATAGACAGTATC
>test_NIHPAK-19_S
GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNAATGGAGAAAAGACATAGGCTTCCGTGTCA
```

Here, three segments are given named `L`, `M` and `S`, and the ID for the whole sequence is `test_NIHPAK`.

A segment cannot be empty.
