use crate::mutations;
use crate::types::*;
use duckdb::params;
use std::path::Path;
use tracing::{info, warn};

pub fn load_reference_genomes(path: &Path) -> Result<ReferenceGenomes, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let refs: ReferenceGenomes = serde_json::from_str(&content)?;
    Ok(refs)
}

pub fn discover_organisms(ref_dir: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let dir = Path::new(ref_dir);
    if !dir.exists() { return Err(format!("Dir not found: {}", ref_dir).into()); }
    let mut orgs = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                orgs.push(stem.to_string());
            }
        }
    }
    orgs.sort();
    Ok(orgs)
}

fn create_duckdb_tables(conn: &duckdb::Connection) -> Result<(), duckdb::Error> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS metadata (
            accession_version TEXT PRIMARY KEY,
            metadata_json TEXT
        );
        CREATE TABLE IF NOT EXISTS nuc_mutations (
            accession_version TEXT, segment TEXT,
            position INTEGER, ref_base TEXT, alt_base TEXT
        );
        CREATE TABLE IF NOT EXISTS aa_mutations (
            accession_version TEXT, gene TEXT,
            position INTEGER, ref_aa TEXT, alt_aa TEXT
        );
        CREATE TABLE IF NOT EXISTS nuc_coverage (
            accession_version TEXT, segment TEXT,
            coverage_bitmap BLOB
        );
        CREATE TABLE IF NOT EXISTS aa_coverage (
            accession_version TEXT, gene TEXT,
            coverage_bitmap BLOB
        );
        CREATE TABLE IF NOT EXISTS nuc_insertions (
            accession_version TEXT, segment TEXT,
            position INTEGER, inserted_symbols TEXT
        );
        CREATE TABLE IF NOT EXISTS aa_insertions (
            accession_version TEXT, gene TEXT,
            position INTEGER, inserted_symbols TEXT
        );
        CREATE TABLE IF NOT EXISTS aligned_nuc_sequences (
            accession_version TEXT, segment TEXT, sequence TEXT
        );
        CREATE TABLE IF NOT EXISTS unaligned_nuc_sequences (
            accession_version TEXT, segment TEXT, sequence TEXT
        );
        CREATE TABLE IF NOT EXISTS aligned_aa_sequences (
            accession_version TEXT, gene TEXT, sequence TEXT
        );
    ")?;
    Ok(())
}

fn create_duckdb_indexes(conn: &duckdb::Connection) -> Result<(), duckdb::Error> {
    conn.execute_batch("
        CREATE INDEX IF NOT EXISTS idx_nuc_mut_acc ON nuc_mutations (accession_version);
        CREATE INDEX IF NOT EXISTS idx_aa_mut_acc ON aa_mutations (accession_version);
        CREATE INDEX IF NOT EXISTS idx_nuc_cov_acc ON nuc_coverage (accession_version);
        CREATE INDEX IF NOT EXISTS idx_aa_cov_acc ON aa_coverage (accession_version);
        CREATE INDEX IF NOT EXISTS idx_nuc_ins_acc ON nuc_insertions (accession_version);
        CREATE INDEX IF NOT EXISTS idx_aa_ins_acc ON aa_insertions (accession_version);
        CREATE INDEX IF NOT EXISTS idx_aln_nuc_acc ON aligned_nuc_sequences (accession_version);
        CREATE INDEX IF NOT EXISTS idx_unaln_nuc_acc ON unaligned_nuc_sequences (accession_version);
        CREATE INDEX IF NOT EXISTS idx_aln_aa_acc ON aligned_aa_sequences (accession_version);
    ")?;
    Ok(())
}

fn process_record(
    conn: &duckdb::Connection,
    record: &ReleasedRecord,
    reference: &ReferenceGenomes,
) -> Result<(), Box<dyn std::error::Error>> {
    let accv = record.metadata.get("accessionVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let metadata_json = serde_json::to_string(&record.metadata)?;
    conn.execute(
        "INSERT INTO metadata (accession_version, metadata_json) VALUES (?, ?)",
        params![accv, metadata_json],
    )?;

    for ref_seq in &reference.nucleotide_sequences {
        let seg = &ref_seq.name;
        if let Some(Some(aligned)) = record.aligned_nucleotide_sequences.get(seg) {
            let (muts, cov) = mutations::compute_nuc_mutations_for_record(aligned, &ref_seq.sequence);
            let cov_bytes: Vec<u8> = cov.into_vec();
            conn.execute("INSERT INTO aligned_nuc_sequences VALUES (?, ?, ?)", params![accv, seg, aligned])?;
            conn.execute("INSERT INTO nuc_coverage VALUES (?, ?, ?)", params![accv, seg, cov_bytes])?;
            for (pos, rb, sb) in &muts {
                conn.execute("INSERT INTO nuc_mutations VALUES (?, ?, ?, ?, ?)",
                    params![accv, seg, *pos as i32, rb.to_string(), sb.to_string()])?;
            }
        }
        if let Some(Some(unaligned)) = record.unaligned_nucleotide_sequences.get(seg) {
            conn.execute("INSERT INTO unaligned_nuc_sequences VALUES (?, ?, ?)", params![accv, seg, unaligned])?;
        }
    }

    for ref_gene in &reference.genes {
        let gene = &ref_gene.name;
        if let Some(Some(aligned)) = record.aligned_amino_acid_sequences.get(gene) {
            let (muts, cov) = mutations::compute_aa_mutations_for_record(aligned, &ref_gene.sequence);
            let cov_bytes: Vec<u8> = cov.into_vec();
            conn.execute("INSERT INTO aligned_aa_sequences VALUES (?, ?, ?)", params![accv, gene, aligned])?;
            conn.execute("INSERT INTO aa_coverage VALUES (?, ?, ?)", params![accv, gene, cov_bytes])?;
            for (pos, ra, sa) in &muts {
                conn.execute("INSERT INTO aa_mutations VALUES (?, ?, ?, ?, ?)",
                    params![accv, gene, *pos as i32, ra.to_string(), sa.to_string()])?;
            }
        }
    }

    for (seg, ins_list) in &record.nucleotide_insertions {
        for ins in ins_list {
            if let Some((pos_str, symbols)) = ins.split_once(':') {
                if let Ok(pos) = pos_str.parse::<i32>() {
                    conn.execute("INSERT INTO nuc_insertions VALUES (?, ?, ?, ?)", params![accv, seg, pos, symbols])?;
                }
            }
        }
    }
    for (gene, ins_list) in &record.amino_acid_insertions {
        for ins in ins_list {
            if let Some((pos_str, symbols)) = ins.split_once(':') {
                if let Ok(pos) = pos_str.parse::<i32>() {
                    conn.execute("INSERT INTO aa_insertions VALUES (?, ?, ?, ?)", params![accv, gene, pos, symbols])?;
                }
            }
        }
    }

    Ok(())
}

/// ETL: Stream NDJSON from backend API, compute mutations, write to DuckDB.
/// Reuses existing DuckDB file if it has data (skips re-download).
pub async fn etl_organism(
    backend_url: &str,
    organism: &str,
    reference: &ReferenceGenomes,
    data_dir: &str,
) -> Result<duckdb::Connection, Box<dyn std::error::Error>> {
    let db_path = format!("{}/{}.duckdb", data_dir, organism);

    // Check if existing DuckDB file has data — if so, reuse it
    if std::path::Path::new(&db_path).exists() {
        if let Ok(existing) = duckdb::Connection::open(&db_path) {
            if let Ok(count) = existing.prepare("SELECT COUNT(*) FROM metadata")
                .and_then(|mut s| s.query_row([], |row| row.get::<_, i64>(0))) {
                if count > 0 {
                    info!("ETL: Reusing existing DuckDB for {} ({} sequences)", organism, count);
                    return Ok(existing);
                }
            }
        }
    }

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(format!("{}.wal", &db_path));
    let conn = duckdb::Connection::open(&db_path)?;
    create_duckdb_tables(&conn)?;

    let url = format!("{}/{}/get-released-data", backend_url, organism);
    info!("ETL: Loading data for {} from {}", organism, url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()?;
    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("Failed to load {}: HTTP {}", organism, resp.status()).into());
    }

    // Download full body (streaming was failing with "error decoding response body")
    let body = resp.text().await?;
    info!("ETL: Downloaded {} bytes for {}", body.len(), organism);

    conn.execute_batch("BEGIN TRANSACTION")?;

    let mut count = 0;
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let record: ReleasedRecord = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => { warn!("Failed to parse record: {}", e); continue; }
        };

        if let Err(e) = process_record(&conn, &record, reference) {
            warn!("Failed to process record: {}", e);
            continue;
        }

        count += 1;
        if count % 1000 == 0 {
            info!("ETL: Processed {} sequences for {}", count, organism);
        }
    }

    conn.execute_batch("COMMIT")?;
    info!("ETL: Loaded {} sequences for {}", count, organism);

    info!("ETL: Creating indexes for {}...", organism);
    create_duckdb_indexes(&conn)?;
    info!("ETL: Done for {}", organism);

    Ok(conn)
}
