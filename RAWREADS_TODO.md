# TODO for raw read support of Pathoplexus

## Essential first steps

- [ ] Ingest: Ingest and upload raw reads linked in INSDC ingest
- [ ] Backend/Config: Put raw reads through to preprocessing
- [ ] Preprocessing: Pass raw reads into output files
- [ ] Config/Website: Show raw reads on website
- [ ] Deposition: Upload raw reads to ENA

## Nice to have later on

- [ ] Preprocessing: Dehumanize raw reads
- [ ] Derive metadata from raw reads:
  - [ ] Total read count
  - [ ] Total base count
  - [ ] Average read length
  - [ ] Average quality score
  - [ ] GC content
  - [ ] Mapping to reference vs human vs non-human
  - [ ] Coverage depth
- [ ] Derive file format from raw reads:
  - [ ] Pileup
  - [ ] VCF
  - [ ] ?
- [ ] Website: Visualize enriched metadata, e.g. pileup
