use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde_json::Value;
use std::collections::HashMap;
use tracing::error;
use crate::duckdb_query;
use crate::pg_query;
use crate::response::AppError;

use crate::store::SharedStore;
use crate::endpoints::details::{merge_request, apply_sequence_filters, has_sequence_filters, has_metadata_filters};

fn format_fasta(seqs: &[(String, String)]) -> String {
    let mut f = String::new();
    for (acc, seq) in seqs { f.push_str(&format!(">{}\n{}\n", acc, seq)); }
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

fn fasta_response(fasta: String, data_version: &str) -> Response {
    let mut resp = ([(header::CONTENT_TYPE, "text/x-fasta")], fasta).into_response();
    if let Ok(val) = data_version.parse() {
        resp.headers_mut().insert("Lapis-Data-Version", val);
    }
    resp
}

pub async fn handle_unaligned_nuc_sequences(State(store): State<SharedStore>, Path(organism): Path<String>, Query(qp): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let req = merge_request(qp, body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let seg = org.reference.nucleotide_sequences.first().map(|s| s.name.clone()).unwrap_or_default();
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = { let c = org.duckdb.lock().unwrap(); let seqs = duckdb_query::get_sequences(&c, &page, "unaligned_nuc_sequences", "segment", &seg).map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?; format_fasta(&seqs) };
    Ok(fasta_response(fasta, &dv))
}

pub async fn handle_unaligned_nuc_sequences_seg(State(store): State<SharedStore>, Path((organism, segment)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.nucleotide_sequences.iter().any(|s| s.name == segment) {
        return Err(AppError::bad_request(format!("Unknown segment: {}", segment)));
    }
    let req = merge_request(qp, body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = { let c = org.duckdb.lock().unwrap(); let seqs = duckdb_query::get_sequences(&c, &page, "unaligned_nuc_sequences", "segment", &segment).map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?; format_fasta(&seqs) };
    Ok(fasta_response(fasta, &dv))
}

pub async fn handle_aligned_nuc_sequences(State(store): State<SharedStore>, Path(organism): Path<String>, Query(qp): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let req = merge_request(qp, body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let ref_seg = org.reference.nucleotide_sequences.first()
        .ok_or_else(|| AppError::not_found("No nucleotide sequences"))?;
    let seg = ref_seg.name.clone();
    let fill_len = ref_seg.sequence.len();
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = { let c = org.duckdb.lock().unwrap(); let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_nuc_sequences", "segment", &seg, 'N', fill_len).map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?; format_fasta(&seqs) };
    Ok(fasta_response(fasta, &dv))
}

pub async fn handle_aligned_nuc_sequences_seg(State(store): State<SharedStore>, Path((organism, segment)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.nucleotide_sequences.iter().any(|s| s.name == segment) {
        return Err(AppError::bad_request(format!("Unknown segment: {}", segment)));
    }
    let req = merge_request(qp, body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let fill_len = org.reference.nucleotide_sequences.iter().find(|s| s.name == segment).map(|s| s.sequence.len()).unwrap_or(0);
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = { let c = org.duckdb.lock().unwrap(); let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_nuc_sequences", "segment", &segment, 'N', fill_len).map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?; format_fasta(&seqs) };
    Ok(fasta_response(fasta, &dv))
}

pub async fn handle_aligned_aa_sequences(State(store): State<SharedStore>, Path((organism, gene)): Path<(String, String)>, Query(qp): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    if !org.reference.genes.iter().any(|g| g.name == gene) {
        return Err(AppError::bad_request(format!("Unknown gene: {}", gene)));
    }
    let req = merge_request(qp, body);
    let offset = req.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = req.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let fill_len = org.reference.genes.iter().find(|g| g.name == gene).map(|g| g.sequence.len()).unwrap_or(0);
    let accs = get_filtered_accs(&store, org, &organism, &req).await?;
    let page: Vec<String> = accs.into_iter().skip(offset).take(limit).collect();
    let dv = org.data_version();
    let fasta = { let c = org.duckdb.lock().unwrap(); let seqs = duckdb_query::get_sequences_with_fill(&c, &page, "aligned_aa_sequences", "gene", &gene, 'X', fill_len).map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence error: {}", e)) })?; format_fasta(&seqs) };
    Ok(fasta_response(fasta, &dv))
}
