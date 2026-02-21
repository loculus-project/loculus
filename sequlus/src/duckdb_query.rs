use bitvec::prelude::*;
use duckdb::params;
use std::collections::{HashMap, HashSet};
use crate::types::*;

/// Build an AND clause restricting accession_version to the given set.
/// None = no restriction, Some([]) = match nothing, Some([a,b]) = IN ('a','b')
fn acc_filter(accessions: Option<&[String]>) -> String {
    match accessions {
        None => String::new(),
        Some(accs) if accs.is_empty() => " AND FALSE".to_string(),
        Some(accs) => {
            let vals: Vec<String> = accs.iter()
                .map(|a| format!("'{}'", a.replace('\'', "''")))
                .collect();
            format!(" AND accession_version IN ({})", vals.join(","))
        }
    }
}


/// Filter accessions by nucleotide mutations.
/// `accessions`: None = all accessions in DuckDB, Some = restrict to these.
pub fn filter_by_nuc_mutations(conn: &duckdb::Connection, accessions: Option<&[String]>, mutations: &[ParsedMutation], reference: &ReferenceGenomes) -> Result<Vec<String>, duckdb::Error> {
    if mutations.is_empty() {
        return match accessions {
            None => {
                let mut stmt = conn.prepare("SELECT accession_version FROM metadata")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                rows.collect()
            }
            Some(accs) => Ok(accs.to_vec()),
        };
    }

    let af = acc_filter(accessions);
    let mut current_set: Option<HashSet<String>> = None;

    for pm in mutations {
        let restrict = match &current_set {
            None => af.clone(),
            Some(set) if set.is_empty() => return Ok(vec![]),
            Some(set) => acc_filter(Some(&set.iter().cloned().collect::<Vec<_>>())),
        };

        let segs: Vec<&str> = if let Some(ref s) = pm.segment_or_gene {
            vec![s.as_str()]
        } else {
            reference.nucleotide_sequences.iter().map(|s| s.name.as_str()).collect()
        };

        let mut matching: HashSet<String> = HashSet::new();
        for seg in &segs {
            let ref_base = reference.nucleotide_sequences.iter()
                .find(|s| s.name == *seg)
                .and_then(|s| s.sequence.chars().nth(pm.position))
                .map(|c| c.to_ascii_uppercase());

            match &pm.to {
                MutationTo::AnyMutation => {
                    let sql = format!(
                        "SELECT DISTINCT accession_version FROM nuc_mutations WHERE segment = ? AND position = ?{}",
                        restrict
                    );
                    let mut stmt = conn.prepare(&sql)?;
                    let rows = stmt.query_map(params![seg, pm.position as i32], |row| row.get(0))?;
                    for row in rows { matching.insert(row?); }
                }
                MutationTo::Reference => {
                    // Covered at this position AND not mutated = reference
                    let sql_mutated = format!(
                        "SELECT DISTINCT accession_version FROM nuc_mutations WHERE segment = ? AND position = ?{}",
                        restrict
                    );
                    let mut stmt = conn.prepare(&sql_mutated)?;
                    let rows = stmt.query_map(params![seg, pm.position as i32], |row| row.get(0))?;
                    let mutated: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

                    let sql_cov = format!(
                        "SELECT accession_version, coverage_bitmap FROM nuc_coverage WHERE segment = ?{}",
                        restrict
                    );
                    let mut cstmt = conn.prepare(&sql_cov)?;
                    let crows = cstmt.query_map(params![seg], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)))?;
                    for row in crows {
                        let (acc, bm) = row?;
                        let bv = BitVec::<u8, Msb0>::from_vec(bm);
                        if bv.get(pm.position).map(|b| *b).unwrap_or(false) && !mutated.contains(&acc) {
                            matching.insert(acc);
                        }
                    }
                }
                MutationTo::Base(target) => {
                    if ref_base == Some(*target) {
                        // Target is reference — same as Reference logic
                        let sql_mutated = format!(
                            "SELECT DISTINCT accession_version FROM nuc_mutations WHERE segment = ? AND position = ?{}",
                            restrict
                        );
                        let mut stmt = conn.prepare(&sql_mutated)?;
                        let rows = stmt.query_map(params![seg, pm.position as i32], |row| row.get(0))?;
                        let mutated: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

                        let sql_cov = format!(
                            "SELECT accession_version, coverage_bitmap FROM nuc_coverage WHERE segment = ?{}",
                            restrict
                        );
                        let mut cstmt = conn.prepare(&sql_cov)?;
                        let crows = cstmt.query_map(params![seg], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)))?;
                        for row in crows {
                            let (acc, bm) = row?;
                            let bv = BitVec::<u8, Msb0>::from_vec(bm);
                            if bv.get(pm.position).map(|b| *b).unwrap_or(false) && !mutated.contains(&acc) {
                                matching.insert(acc);
                            }
                        }
                    } else {
                        let ts = target.to_string();
                        let sql = format!(
                            "SELECT DISTINCT accession_version FROM nuc_mutations WHERE segment = ? AND position = ? AND alt_base = ?{}",
                            restrict
                        );
                        let mut stmt = conn.prepare(&sql)?;
                        let rows = stmt.query_map(params![seg, pm.position as i32, ts], |row| row.get(0))?;
                        for row in rows { matching.insert(row?); }
                    }
                }
            }
        }
        current_set = Some(match current_set {
            None => matching,
            Some(prev) => prev.intersection(&matching).cloned().collect(),
        });
    }

    Ok(current_set.unwrap_or_default().into_iter().collect())
}

/// Filter accessions by amino acid mutations.
pub fn filter_by_aa_mutations(conn: &duckdb::Connection, accessions: Option<&[String]>, mutations: &[ParsedMutation], reference: &ReferenceGenomes) -> Result<Vec<String>, duckdb::Error> {
    if mutations.is_empty() {
        return match accessions {
            None => {
                let mut stmt = conn.prepare("SELECT accession_version FROM metadata")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                rows.collect()
            }
            Some(accs) => Ok(accs.to_vec()),
        };
    }

    let af = acc_filter(accessions);
    let mut current_set: Option<HashSet<String>> = None;

    for pm in mutations {
        let restrict = match &current_set {
            None => af.clone(),
            Some(set) if set.is_empty() => return Ok(vec![]),
            Some(set) => acc_filter(Some(&set.iter().cloned().collect::<Vec<_>>())),
        };

        let gene = match pm.segment_or_gene.as_ref() { Some(g) => g, None => continue };
        let ref_base = reference.genes.iter().find(|g| g.name == *gene).and_then(|g| g.sequence.chars().nth(pm.position));

        let mut matching: HashSet<String> = HashSet::new();
        match &pm.to {
            MutationTo::AnyMutation => {
                let sql = format!(
                    "SELECT DISTINCT accession_version FROM aa_mutations WHERE gene = ? AND position = ?{}",
                    restrict
                );
                let mut stmt = conn.prepare(&sql)?;
                let rows = stmt.query_map(params![gene, pm.position as i32], |row| row.get(0))?;
                for row in rows { matching.insert(row?); }
            }
            MutationTo::Reference => {
                let sql_mutated = format!(
                    "SELECT DISTINCT accession_version FROM aa_mutations WHERE gene = ? AND position = ?{}",
                    restrict
                );
                let mut stmt = conn.prepare(&sql_mutated)?;
                let rows = stmt.query_map(params![gene, pm.position as i32], |row| row.get(0))?;
                let mutated: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

                let sql_cov = format!(
                    "SELECT accession_version, coverage_bitmap FROM aa_coverage WHERE gene = ?{}",
                    restrict
                );
                let mut cstmt = conn.prepare(&sql_cov)?;
                let crows = cstmt.query_map(params![gene], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)))?;
                for row in crows {
                    let (acc, bm) = row?;
                    let bv = BitVec::<u8, Msb0>::from_vec(bm);
                    if bv.get(pm.position).map(|b| *b).unwrap_or(false) && !mutated.contains(&acc) {
                        matching.insert(acc);
                    }
                }
            }
            MutationTo::Base(target) => {
                if ref_base == Some(*target) {
                    let sql_mutated = format!(
                        "SELECT DISTINCT accession_version FROM aa_mutations WHERE gene = ? AND position = ?{}",
                        restrict
                    );
                    let mut stmt = conn.prepare(&sql_mutated)?;
                    let rows = stmt.query_map(params![gene, pm.position as i32], |row| row.get(0))?;
                    let mutated: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

                    let sql_cov = format!(
                        "SELECT accession_version, coverage_bitmap FROM aa_coverage WHERE gene = ?{}",
                        restrict
                    );
                    let mut cstmt = conn.prepare(&sql_cov)?;
                    let crows = cstmt.query_map(params![gene], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)))?;
                    for row in crows {
                        let (acc, bm) = row?;
                        let bv = BitVec::<u8, Msb0>::from_vec(bm);
                        if bv.get(pm.position).map(|b| *b).unwrap_or(false) && !mutated.contains(&acc) {
                            matching.insert(acc);
                        }
                    }
                } else {
                    let ts = target.to_string();
                    let sql = format!(
                        "SELECT DISTINCT accession_version FROM aa_mutations WHERE gene = ? AND position = ? AND alt_aa = ?{}",
                        restrict
                    );
                    let mut stmt = conn.prepare(&sql)?;
                    let rows = stmt.query_map(params![gene, pm.position as i32, ts], |row| row.get(0))?;
                    for row in rows { matching.insert(row?); }
                }
            }
        }
        current_set = Some(match current_set {
            None => matching,
            Some(prev) => prev.intersection(&matching).cloned().collect(),
        });
    }

    Ok(current_set.unwrap_or_default().into_iter().collect())
}

pub fn filter_by_nuc_insertions(conn: &duckdb::Connection, accessions: Option<&[String]>, insertions: &[ParsedInsertion]) -> Result<Vec<String>, duckdb::Error> {
    if insertions.is_empty() {
        return match accessions {
            None => {
                let mut stmt = conn.prepare("SELECT accession_version FROM metadata")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                rows.collect()
            }
            Some(accs) => Ok(accs.to_vec()),
        };
    }

    let af = acc_filter(accessions);
    let mut current_set: Option<HashSet<String>> = None;

    for pi in insertions {
        let restrict = match &current_set {
            None => af.clone(),
            Some(set) if set.is_empty() => return Ok(vec![]),
            Some(set) => acc_filter(Some(&set.iter().cloned().collect::<Vec<_>>())),
        };

        let sf = if let Some(ref s) = pi.segment_or_gene {
            format!(" AND segment = '{}'", s.replace('\'', "''"))
        } else { String::new() };

        let sql = format!(
            "SELECT DISTINCT accession_version FROM nuc_insertions WHERE position = ? {sf} AND UPPER(inserted_symbols) LIKE '%' || ? || '%'{}",
            restrict
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pi.position as i32, pi.inserted], |row| row.get(0))?;
        let matching: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

        current_set = Some(match current_set {
            None => matching,
            Some(prev) => prev.intersection(&matching).cloned().collect(),
        });
    }

    Ok(current_set.unwrap_or_default().into_iter().collect())
}

pub fn filter_by_aa_insertions(conn: &duckdb::Connection, accessions: Option<&[String]>, insertions: &[ParsedInsertion]) -> Result<Vec<String>, duckdb::Error> {
    if insertions.is_empty() {
        return match accessions {
            None => {
                let mut stmt = conn.prepare("SELECT accession_version FROM metadata")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                rows.collect()
            }
            Some(accs) => Ok(accs.to_vec()),
        };
    }

    let af = acc_filter(accessions);
    let mut current_set: Option<HashSet<String>> = None;

    for pi in insertions {
        let restrict = match &current_set {
            None => af.clone(),
            Some(set) if set.is_empty() => return Ok(vec![]),
            Some(set) => acc_filter(Some(&set.iter().cloned().collect::<Vec<_>>())),
        };

        let gf = if let Some(ref g) = pi.segment_or_gene {
            format!(" AND gene = '{}'", g.replace('\'', "''"))
        } else { String::new() };

        let sql = format!(
            "SELECT DISTINCT accession_version FROM aa_insertions WHERE position = ? {gf} AND UPPER(inserted_symbols) LIKE '%' || ? || '%'{}",
            restrict
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![pi.position as i32, pi.inserted], |row| row.get(0))?;
        let matching: HashSet<String> = rows.filter_map(|r| r.ok()).collect();

        current_set = Some(match current_set {
            None => matching,
            Some(prev) => prev.intersection(&matching).cloned().collect(),
        });
    }

    Ok(current_set.unwrap_or_default().into_iter().collect())
}

/// Get nucleotide mutation counts. `accessions`: None = all, Some = restrict.
pub fn get_nuc_mutation_counts(conn: &duckdb::Connection, accessions: Option<&[String]>, reference: &ReferenceGenomes, min_proportion: f64) -> Result<Vec<MutationRecord>, duckdb::Error> {
    let af = acc_filter(accessions);
    let has_multiple_segs = reference.nucleotide_sequences.len() > 1;

    let sql = format!(
        "SELECT segment, position, ref_base, alt_base, COUNT(*) as cnt FROM nuc_mutations WHERE TRUE{} GROUP BY segment, position, ref_base, alt_base",
        af
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut mutation_counts: Vec<(String, i32, String, String, i64)> = Vec::new();
    let mut mutated_positions: HashSet<(String, usize)> = HashSet::new();
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?)))?;
    for row in rows { let r = row?; mutated_positions.insert((r.0.clone(), r.1 as usize)); mutation_counts.push(r); }

    let mut pos_coverage: HashMap<(String, usize), usize> = HashMap::new();
    let cov_sql = format!(
        "SELECT accession_version, segment, coverage_bitmap FROM nuc_coverage WHERE TRUE{}",
        af
    );
    let mut cov_stmt = conn.prepare(&cov_sql)?;
    let cov_rows = cov_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Vec<u8>>(2)?)))?;
    for row in cov_rows {
        let (_acc, seg, bm) = row?;
        let bv = BitVec::<u8, Msb0>::from_vec(bm);
        for &(ref sk, pos) in &mutated_positions {
            if seg == *sk {
                if bv.get(pos).map(|b| *b).unwrap_or(false) {
                    *pos_coverage.entry((seg.clone(), pos)).or_insert(0) += 1;
                }
            }
        }
    }

    let mut records: Vec<MutationRecord> = Vec::new();
    for (seg, pos, rb, sb, count) in &mutation_counts {
        let coverage = pos_coverage.get(&(seg.clone(), *pos as usize)).copied().unwrap_or(0);
        let proportion = if coverage > 0 { *count as f64 / coverage as f64 } else { 0.0 };
        if proportion >= min_proportion {
            let ms = if has_multiple_segs { format!("{}:{}{}{}", seg, rb, pos + 1, sb) } else { format!("{}{}{}", rb, pos + 1, sb) };
            records.push(MutationRecord { mutation: ms, count: *count as usize, coverage, proportion, sequence_name: if has_multiple_segs { Some(seg.clone()) } else { None }, mutation_from: rb.clone(), mutation_to: sb.clone(), position: (*pos + 1) as usize });
        }
    }
    records.sort_by(|a, b| a.position.cmp(&b.position).then_with(|| a.mutation.cmp(&b.mutation)));
    Ok(records)
}

/// Get amino acid mutation counts. `accessions`: None = all, Some = restrict.
pub fn get_aa_mutation_counts(conn: &duckdb::Connection, accessions: Option<&[String]>, _reference: &ReferenceGenomes, min_proportion: f64) -> Result<Vec<MutationRecord>, duckdb::Error> {
    let af = acc_filter(accessions);

    let sql = format!(
        "SELECT gene, position, ref_aa, alt_aa, COUNT(*) as cnt FROM aa_mutations WHERE TRUE{} GROUP BY gene, position, ref_aa, alt_aa",
        af
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut mutation_counts: Vec<(String, i32, String, String, i64)> = Vec::new();
    let mut mutated_positions: HashSet<(String, usize)> = HashSet::new();
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?)))?;
    for row in rows { let r = row?; mutated_positions.insert((r.0.clone(), r.1 as usize)); mutation_counts.push(r); }

    let mut pos_coverage: HashMap<(String, usize), usize> = HashMap::new();
    let cov_sql = format!(
        "SELECT accession_version, gene, coverage_bitmap FROM aa_coverage WHERE TRUE{}",
        af
    );
    let mut cov_stmt = conn.prepare(&cov_sql)?;
    let cov_rows = cov_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Vec<u8>>(2)?)))?;
    for row in cov_rows {
        let (_acc, gene, bm) = row?;
        let bv = BitVec::<u8, Msb0>::from_vec(bm);
        for &(ref gk, pos) in &mutated_positions {
            if gene == *gk {
                if bv.get(pos).map(|b| *b).unwrap_or(false) {
                    *pos_coverage.entry((gene.clone(), pos)).or_insert(0) += 1;
                }
            }
        }
    }

    let mut records: Vec<MutationRecord> = Vec::new();
    for (gene, pos, ra, sa, count) in &mutation_counts {
        let coverage = pos_coverage.get(&(gene.clone(), *pos as usize)).copied().unwrap_or(0);
        let proportion = if coverage > 0 { *count as f64 / coverage as f64 } else { 0.0 };
        if proportion >= min_proportion {
            records.push(MutationRecord { mutation: format!("{}:{}{}{}", gene, ra, pos + 1, sa), count: *count as usize, coverage, proportion, sequence_name: Some(gene.clone()), mutation_from: ra.clone(), mutation_to: sa.clone(), position: (*pos + 1) as usize });
        }
    }
    records.sort_by(|a, b| a.sequence_name.cmp(&b.sequence_name).then_with(|| a.position.cmp(&b.position)));
    Ok(records)
}

pub fn get_nuc_insertion_counts(conn: &duckdb::Connection, accessions: Option<&[String]>, has_multiple_segs: bool) -> Result<Vec<InsertionRecord>, duckdb::Error> {
    let af = acc_filter(accessions);
    let sql = format!(
        "SELECT segment, position, inserted_symbols, COUNT(*) as cnt FROM nuc_insertions WHERE TRUE{} GROUP BY segment, position, inserted_symbols ORDER BY position",
        af
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?)))?;
    let mut records = Vec::new();
    for row in rows {
        let (seg, pos, sym, cnt) = row?;
        let label = if has_multiple_segs { format!("ins_{}:{}:{}", seg, pos, sym) } else { format!("ins_{}:{}", pos, sym) };
        records.push(InsertionRecord { insertion: label, count: cnt as usize, inserted_symbols: sym, position: pos as usize, sequence_name: if has_multiple_segs { Some(seg) } else { None } });
    }
    Ok(records)
}

pub fn get_aa_insertion_counts(conn: &duckdb::Connection, accessions: Option<&[String]>) -> Result<Vec<InsertionRecord>, duckdb::Error> {
    let af = acc_filter(accessions);
    let sql = format!(
        "SELECT gene, position, inserted_symbols, COUNT(*) as cnt FROM aa_insertions WHERE TRUE{} GROUP BY gene, position, inserted_symbols ORDER BY gene, position",
        af
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?)))?;
    let mut records = Vec::new();
    for row in rows {
        let (gene, pos, sym, cnt) = row?;
        records.push(InsertionRecord { insertion: format!("ins_{}:{}:{}", gene, pos, sym), count: cnt as usize, inserted_symbols: sym, position: pos as usize, sequence_name: Some(gene) });
    }
    Ok(records)
}

pub fn get_sequences(conn: &duckdb::Connection, accessions: &[String], table: &str, name_col: &str, name_value: &str) -> Result<Vec<(String, String)>, duckdb::Error> {
    if accessions.is_empty() { return Ok(vec![]); }
    let af = acc_filter(Some(accessions));
    let sql = format!("SELECT accession_version, sequence FROM {table} WHERE {name_col} = ?{af}");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![name_value], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

/// Like get_sequences but fills in missing accessions with a placeholder sequence
pub fn get_sequences_with_fill(conn: &duckdb::Connection, accessions: &[String], table: &str, name_col: &str, name_value: &str, fill_char: char, fill_length: usize) -> Result<Vec<(String, String)>, duckdb::Error> {
    if accessions.is_empty() { return Ok(vec![]); }
    let af = acc_filter(Some(accessions));
    let sql = format!("SELECT accession_version, sequence FROM {table} WHERE {name_col} = ?{af}");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![name_value], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut found: HashMap<String, String> = HashMap::new();
    for row in rows { let (acc, seq) = row?; found.insert(acc, seq); }
    let fill_seq = fill_char.to_string().repeat(fill_length);
    let result: Vec<(String, String)> = accessions.iter().map(|acc| {
        let seq = found.get(acc).cloned().unwrap_or_else(|| fill_seq.clone());
        (acc.clone(), seq)
    }).collect();
    Ok(result)
}
