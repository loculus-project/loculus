# 20. External Tool Linkouts

The ReVSeq preview exposes search-page tool linkouts through Loculus
`schema.linkOuts`.

| Tool | Use | Dataset/source |
| --- | --- | --- |
| Nextclade | Open selected unaligned consensus FASTA in Nextclade Web. | Public Nextclade dataset names for SARS-CoV-2, RSV, whole-genome influenza segments, and HMPV. Dashboard-only HPIV and seasonal-coronavirus datasets use `dataset-url` links to the pinned ReVSeq-dashboard commit `141734a6ea03d99e789b8be4eb52c184096e3bda`. |
| Sealion | Open selected aligned consensus FASTA in Sealion. | `https://artic-network.github.io/sealion/` with the Loculus aligned FASTA download URL. |
| Viral UShER tree | Place selected unaligned consensus FASTA on a matching viral tree. | `https://angiehinrichs.github.io/viral_usher_trees/` for RSV-A, RSV-B, HMPV, HPIV-1, HPIV-2, HPIV-3, HPIV-4a, and seasonal coronaviruses 229E/HKU1/NL63/OC43. |

No viral UShER link is configured for SARS-CoV-2 or influenza in this
preview. The viral UShER repository does not provide a directly matching
SARS-CoV-2 tree in the inspected tree set, and the influenza trees are
segmented whole-virus references rather than the dashboard influenza references
used by this Loculus configuration.
