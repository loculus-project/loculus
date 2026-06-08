# 5. Building Block View

| Building block | Responsibility |
| --- | --- |
| ReVSeq Helm values | Defines instance name, enabled organisms, metadata fields, file categories, and preprocessing config. |
| Dashboard pathogen organisms | Accept consensus sequences for all dashboard pathogens and expose searchable metadata through Loculus/LAPIS. |
| Multi-reference and multi-segment organisms | Model RSV-A/B as `rsv`, whole-genome influenza A as eight-segment `influenza-a` with H1N1/H3N2 references, whole-genome influenza B as eight-segment `influenza-b`, HPIV-1/2/3/4a as `hpiv`, and seasonal coronaviruses as `seasonal-coronavirus`. |
| ENA preparation script | Downloads and formats all matching PRJEB83635 consensus records, documents configured targets with no records, and flags low-completeness influenza entries without excluding them. |
| `revseqSeed` job | Seeds the public preview by submitting per-organism metadata plus consensus FASTA through the normal Loculus API and approving processed records. |
| Nextclade preprocessing | Aligns sequences, derives available lineage/clade metadata, and records QC scores. |
| Bundled ReVSeq datasets | Provide dashboard-only HPIV and seasonal coronavirus Nextclade datasets inside the preprocessing image. |
