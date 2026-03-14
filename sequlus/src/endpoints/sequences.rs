use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;
use tracing::error;
use crate::duckdb_query;
use crate::pg_query;
use crate::response::{AppError, compress_bytes};

use crate::store::SharedStore;
use crate::endpoints::details::{merge_request, apply_sequence_filters, has_sequence_filters, has_metadata_filters};

fn format_fasta(seqs: &[(String, String)]) -> String {
    let mut f = String::new();
    for (acc, seq) in seqs { f.push_str(&format!(">{}\n{}\n", acc, seq)); }
    f
}

/// Format FASTA with custom header template.
/// Template uses `{fieldName}` placeholders, e.g. `{accessionVersion}|{displayName}`.
/// Looks up metadata for each accession to fill in the template.
fn format_fasta_with_template(
    seqs: &[(String, String)],
    template: &str,
    metadata: &HashMap<String, serde_json::Value>,
) -> String {
    let mut f = String::new();
    for (acc, seq) in seqs {
        let header = if let Some(meta) = metadata.get(acc) {
            let mut h = template.to_string();
            if let serde_json::Value::Object(map) = meta {
                for (key, val) in map {
                    let replacement = match val {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Null => String::new(),
                        v => v.to_string(),
                    };
                    h = h.replace(&format!("{{{}}}", key), &replacement);
                }
            }
            h
        } else {
            acc.clone()
        };
        f.push_str(&format!(">{}\n{}\n", header, seq));
    }
    f
}

async fn get_filtered_accs(
    store: &crate::store::DataStore,
    org_store: &crate::store::OrganismStore,
    organism: &str,
    request: &crate::types::LapisRequest,
) -> Result<Vec<String>, AppError> {
    if !has_sequence_filters(request) && !has_metadata_filters(request) {
        let conn = org_store.duckdb.lock().unwrap();
        let mut stmt = conn.prepare("SELECT accession_version FROM metadata")
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
        let rows = stmt.query_map([], |row| row.get(0))
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
        return rows.collect::<Result<Vec<String>, _>>()
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") });
    }

    let seq_filtered = if has_sequence_filters(request) {
        let conn = org_store.duckdb.lock().unwrap();
        Some(apply_sequence_filters(&conn, None, request, &org_store.reference)?)
    } else { None };

    if has_metadata_filters(request) {
        pg_query::get_filtered_accessions(&store.pg_pool, request, organism, seq_filtered.as_deref())
            .await.map_err(|e| { error!("Postgres: {}", e); AppError::internal(format!("Database error: {}", e)) })
    } else {
        Ok(seq_filtered.unwrap_or_default())
    }
}

/// Look up metadata for the given accessions to fill in FASTA header templates.
fn get_metadata_for_template(
    conn: &duckdb::Connection,
    accessions: &[String],
) -> HashMap<String, serde_json::Value> {
    let mut result = HashMap::new();
    if let Ok(rows) = duckdb_query::get_metadata(conn, accessions) {
        for (acc, json_str) in rows {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                result.insert(acc, val);
            }
        }
    }
    result
}

fn fasta_response(fasta: String, data_version: &str, request: &crate::types::LapisRequest) -> Response {
    let compression = request.filters.get("compression")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let download = crate::response::is_download(request);
    let basename = request.filters.get("downloadFileBasename")
        .and_then(|v| v.as_str()).unwrap_or("sequences");

    let mut resp = if !compression.is_empty() {
        if let Some((compressed, encoding, ext)) = compress_bytes(fasta.as_bytes(), &compression) {
            let mut r = ([(header::CONTENT_TYPE, "text/x-fasta;charset=UTF-8")], compressed).into_response();
            r.headers_mut().insert(header::CONTENT_ENCODING, encoding.parse().unwrap());
            if download {
                if let Ok(val) = format!("attachment; filename={}.fasta{}", basename, ext).parse() {
                    r.headers_mut().insert(header::CONTENT_DISPOSITION, val);
                }
            }
            r
        } else {
            ([(header::CONTENT_TYPE, "text/x-fasta;charset=UTF-8")], fasta).into_response()
        }
    } else {
        let mut r = ([(header::CONTENT_TYPE, "text/x-fasta;charset=UTF-8")], fasta).into_response();
        if download {
            if let Ok(val) = format!("attachment; filename={}.fasta", basename).parse() {
                r.headers_mut().insert(header::CONTENT_DISPOSITION, val);
            }
        }
        r
    };

    if let Ok(val) = data_version.parse() {
        resp.headers_mut().insert("Lapis-Data-Version", val);
    }
    resp
}

/// Build FASTA string, optionally using a header template.
fn build_fasta(
    seqs: &[(String, String)],
    request: &crate::types::LapisRequest,
    conn: &duckdb::Connection,
    page: &[String],
) -> String {
    let template = request.filters.get("fastaHeaderTemplate")
        .and_then(|v| v.as_str());

    match template {
        Some(tmpl) if !tmpl.is_empty() => {
            let metadata = get_metadata_for_template(conn, page);
            format_fasta_with_template(seqs, tmpl, &metadata)
        }
        _ => format_fasta(seqs),
    }
}

pub async fn handle_unaligned_nuc_sequences(State(store): State<SharedStore>, Path(organism): Path<String>, Query(qp): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let req = merge_request(qp, &body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let seg = org.reference.nucleotide_sequences.first().map(|s| s.name.clone()).unwrap_or_default();
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = {
        let c = org.duckdb.lock().unwrap();
        let seqs = duckdb_query::get_sequences(&c, &page, "unaligned_nuc_sequences", "segment", &seg)
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?;
        build_fasta(&seqs, &req, &c, &page)
    };
    Ok(fasta_response(fasta, &dv, &req))
}

pub async fn handle_unaligned_nuc_sequences_seg(State(store): State<SharedStore>, Path((organism, segment)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.nucleotide_sequences.iter().any(|s| s.name == segment) {
        return Err(AppError::bad_request(format!("Unknown segment: {}", segment)));
    }
    let req = merge_request(qp, &body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = {
        let c = org.duckdb.lock().unwrap();
        let seqs = duckdb_query::get_sequences(&c, &page, "unaligned_nuc_sequences", "segment", &segment)
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?;
        build_fasta(&seqs, &req, &c, &page)
    };
    Ok(fasta_response(fasta, &dv, &req))
}

pub async fn handle_aligned_nuc_sequences(State(store): State<SharedStore>, Path(organism): Path<String>, Query(qp): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let req = merge_request(qp, &body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let ref_seg = org.reference.nucleotide_sequences.first()
        .ok_or_else(|| AppError::not_found("No nucleotide sequences"))?;
    let seg = ref_seg.name.clone();
    let fill_len = ref_seg.sequence.len();
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = {
        let c = org.duckdb.lock().unwrap();
        let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_nuc_sequences", "segment", &seg, 'N', fill_len)
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?;
        build_fasta(&seqs, &req, &c, &page)
    };
    Ok(fasta_response(fasta, &dv, &req))
}

pub async fn handle_aligned_nuc_sequences_seg(State(store): State<SharedStore>, Path((organism, segment)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.nucleotide_sequences.iter().any(|s| s.name == segment) {
        return Err(AppError::bad_request(format!("Unknown segment: {}", segment)));
    }
    let req = merge_request(qp, &body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let fill_len = org.reference.nucleotide_sequences.iter().find(|s| s.name == segment).map(|s| s.sequence.len()).unwrap_or(0);
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = {
        let c = org.duckdb.lock().unwrap();
        let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_nuc_sequences", "segment", &segment, 'N', fill_len)
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?;
        build_fasta(&seqs, &req, &c, &page)
    };
    Ok(fasta_response(fasta, &dv, &req))
}

pub async fn handle_aligned_aa_sequences(State(store): State<SharedStore>, Path((organism, gene)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: axum::body::Bytes) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.genes.iter().any(|g| g.name == gene) {
        return Err(AppError::bad_request(format!("Unknown gene: {}", gene)));
    }
    let req = merge_request(qp, &body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let fill_len = org.reference.genes.iter().find(|g| g.name == gene).map(|g| g.sequence.len()).unwrap_or(0);
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = {
        let c = org.duckdb.lock().unwrap();
        let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_aa_sequences", "gene", &gene, 'X', fill_len)
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?;
        build_fasta(&seqs, &req, &c, &page)
    };
    Ok(fasta_response(fasta, &dv, &req))
}
