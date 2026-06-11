# 20. Dashboard Pathogen Datasets

Source inspected:

- Dashboard strain configuration:
  `https://github.com/charlynebuerki/ReVSeq-dashboard/blob/141734a6ea03d99e789b8be4eb52c184096e3bda/dashboard/config.py`
- Dashboard Nextclade/Nextstrain pipeline mapping:
  `data_curation/Nextstrain-pipelines/configfile.yaml` at the same commit.

The dashboard uses two classes of datasets:

- Public Nextstrain-hosted Nextclade datasets, downloadable from
  `https://data.clades.nextstrain.org/v3`.
- Custom dashboard datasets, referenced as zip files under
  `ingest/dataset/`. At the pinned dashboard commit, these zip files are not
  committed, but the source `reference.fasta`, `reference.gbk`,
  `annotation.gff3`, and `pathogen.json` files are present under
  `data_curation/Nextstrain-pipelines/ingest/data/`.

| Dashboard pathogen | Dashboard tree dataset | Pipeline key | Nextclade dataset source used by dashboard | Verification result |
| --- | --- | --- | --- | --- |
| Influenza A | `Influenza-A-H1N1-HA` | `flu-a-h1n1` | `nextstrain/flu/h1n1pdm/ha/MW626062` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| Influenza A | `Influenza-A-H3N2-HA` | `flu-a-h3n2` | `nextstrain/flu/h3n2/ha/EPI1857216` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| Influenza B | `Influenza-B` | `flu-b` | `nextstrain/flu/b/ha/KX058884` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| Metapneumovirus | `HMPV` | `hmpv` | `nextstrain/hmpv/all-clades/NC_039199` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| Parainfluenza 1 | `HPIV-1` | `hpiv-1` | `ingest/dataset/dataset_HPIV-1.zip` | Public Nextclade server has no matching HPIV/parainfluenza dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/HPIV-1/`. |
| Parainfluenza 2 | `HPIV-2` | `hpiv-2` | `ingest/dataset/dataset_HPIV-2.zip` | Public Nextclade server has no matching HPIV/parainfluenza dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/HPIV-2/`. |
| Parainfluenza 3 | `HPIV-3` | `hpiv-3` | `ingest/dataset/dataset_HPIV-3.zip` | Public Nextclade server has no matching HPIV/parainfluenza dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/HPIV-3/`. |
| Parainfluenza 4a | `HPIV-4a` | `hpiv-4a` | `ingest/dataset/dataset_HPIV-4a.zip` | Public Nextclade server has no matching HPIV/parainfluenza dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/HPIV-4a/`. |
| RSV - A/B | `RSV-A` | `rsv-a` | `nextstrain/rsv/a/EPI_ISL_412866` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| RSV - A/B | `RSV-B` | `rsv-b` | `nextstrain/rsv/b/EPI_ISL_1653999` | Found on public Nextclade server. Latest listed tag: `2026-04-14--11-55-23Z`. |
| SARS-CoV-2 | `SARS-CoV-2` | `sars-cov-2` | `nextstrain/sars-cov-2/wuhan-hu-1/orfs` | Found on public Nextclade server. Latest listed tag: `2026-04-21--09-39-50Z`. |
| coronavirus 229E | `Coronavirus-229E` | `cov-229e` | `ingest/dataset/dataset_229E.zip` | Public Nextclade server has no matching seasonal coronavirus dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/229E/`. |
| coronavirus HKU1 | `Coronavirus-HKU1` | `cov-hku1` | `ingest/dataset/dataset_HKU1.zip` | Public Nextclade server has no matching seasonal coronavirus dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/HKU1/`. |
| coronavirus NL63 | `Coronavirus-NL63` | `cov-nl63` | `ingest/dataset/dataset_NL63.zip` | Public Nextclade server has no matching seasonal coronavirus dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/NL63/`. |
| coronavirus OC43 | `Coronavirus-OC43` | `cov-oc43` | `ingest/dataset/dataset_OC43.zip` | Public Nextclade server has no matching seasonal coronavirus dataset. Zip is not committed at the pinned dashboard commit; source dataset files are present under `ingest/data/OC43/`. |

## Implementation Implications

- The public datasets can be referenced directly in Loculus Nextclade
  preprocessing configuration.
- The custom HPIV and seasonal-coronavirus datasets cannot be referenced by
  public Nextclade dataset name. To use the same datasets as the dashboard, we
  need to either vendor generated dataset zips from the dashboard pipeline or
  build equivalent dataset directories from the committed source files.
- The current dashboard `STRAIN_CONFIG` also contains color/alias entries for
  other labels such as adenovirus, bocavirus, polyomavirus, and
  rhino-/enterovirus, but those are not configured with tree datasets in
  `STRAIN_CONFIG` and have no Nextclade dataset mapping in the inspected
  pipeline config.
