use axum::extract::{Path, Query, State};
use axum::response::Response;
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::error;
use crate::duckdb_query;
use crate::pg_query;
use crate::response::{AppError, build_response};

use crate::store::SharedStore;
use crate::endpoints::details::{merge_request, apply_sequence_filters, has_sequence_filters, has_metadata_filters};

pub async fn handle_nucleotide_insertions(State(store): State<SharedStore>, Path(organism): Path<String>, Query(query_params): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org_store = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let request = merge_request(query_params, body);
    let has_multiple_segs = org_store.reference.nucleotide_sequences.len() > 1;

    let accessions: Option<Vec<String>> = if has_metadata_filters(&request) || has_sequence_filters(&request) {
        let seq_filtered = if has_sequence_filters(&request) {
            let conn = org_store.duckdb.lock().unwrap();
            Some(apply_sequence_filters(&conn, None, &request, &org_store.reference)?)
        } else { None };

        let pg_filtered = if has_metadata_filters(&request) {
            pg_query::get_filtered_accessions(&store.pg_pool, &request, &organism, seq_filtered.as_deref())
                .await.map_err(|e| { error!("Postgres: {}", e); AppError::internal(format!("Database error: {}", e)) })?
        } else {
            seq_filtered.unwrap_or_default()
        };
        Some(pg_filtered)
    } else {
        None
    };

    let total_count = match &accessions {
        Some(accs) => accs.len(),
        None => {
            let conn = org_store.duckdb.lock().unwrap();
            let mut stmt = conn.prepare("SELECT COUNT(*) FROM metadata").map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
            stmt.query_row([], |row| row.get::<_, i64>(0)).map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })? as usize
        }
    };

    let records = {
        let conn = org_store.duckdb.lock().unwrap();
        duckdb_query::get_nuc_insertion_counts(&conn, accessions.as_deref(), has_multiple_segs)
            .map_err(|e| { error!("DuckDB nuc ins: {}", e); AppError::internal(format!("Sequence query error: {}", e)) })?
    };
    Ok(build_response(json!(records), &org_store.data_version(), total_count, &request))
}

pub async fn handle_amino_acid_insertions(State(store): State<SharedStore>, Path(organism): Path<String>, Query(query_params): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org_store = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let request = merge_request(query_params, body);

    let accessions: Option<Vec<String>> = if has_metadata_filters(&request) || has_sequence_filters(&request) {
        let seq_filtered = if has_sequence_filters(&request) {
            let conn = org_store.duckdb.lock().unwrap();
            Some(apply_sequence_filters(&conn, None, &request, &org_store.reference)?)
        } else { None };

        let pg_filtered = if has_metadata_filters(&request) {
            pg_query::get_filtered_accessions(&store.pg_pool, &request, &organism, seq_filtered.as_deref())
                .await.map_err(|e| { error!("Postgres: {}", e); AppError::internal(format!("Database error: {}", e)) })?
        } else {
            seq_filtered.unwrap_or_default()
        };
        Some(pg_filtered)
    } else {
        None
    };

    let total_count = match &accessions {
        Some(accs) => accs.len(),
        None => {
            let conn = org_store.duckdb.lock().unwrap();
            let mut stmt = conn.prepare("SELECT COUNT(*) FROM metadata").map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
            stmt.query_row([], |row| row.get::<_, i64>(0)).map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })? as usize
        }
    };

    let records = {
        let conn = org_store.duckdb.lock().unwrap();
        duckdb_query::get_aa_insertion_counts(&conn, accessions.as_deref())
            .map_err(|e| { error!("DuckDB aa ins: {}", e); AppError::internal(format!("Sequence query error: {}", e)) })?
    };
    Ok(build_response(json!(records), &org_store.data_version(), total_count, &request))
}
