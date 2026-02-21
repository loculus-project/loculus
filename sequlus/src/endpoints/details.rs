use axum::extract::{Path, Query, State};
use axum::response::Response;
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::error;

use crate::duckdb_query;
use crate::pg_query;
use crate::query;
use crate::response::{AppError, build_response};
use crate::store::SharedStore;
use crate::types::*;

pub async fn handle_details(
    State(store): State<SharedStore>,
    Path(organism): Path<String>,
    Query(query_params): Query<HashMap<String, String>>,
    body: Option<axum::Json<Value>>,
) -> Result<Response, AppError> {
    let org_store = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let request = merge_request(query_params, body);
    let offset = request.filters.get("offset").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(0) as usize;
    let limit = request.filters.get("limit").and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(100) as usize;
    let fields = parse_fields(&request.filters);
    let order_by = parse_order_by(&request.filters);

    let acc_filter = if has_sequence_filters(&request) {
        let filtered = {
            let conn = org_store.duckdb.lock().unwrap();
            apply_sequence_filters(&conn, None, &request, &org_store.reference)?
        };
        Some(filtered)
    } else {
        None
    };

    let rows = pg_query::get_metadata_details(
        &store.pg_pool, &request, &organism, acc_filter.as_deref(),
    ).await.map_err(|e| { error!("Postgres: {}", e); AppError::internal(format!("Database error: {}", e)) })?;

    let total_count = rows.len();
    let mut metadata_rows: Vec<Value> = rows.into_iter()
        .filter_map(|(_, json_str)| serde_json::from_str(&json_str).ok())
        .collect();

    if !order_by.is_empty() {
        metadata_rows.sort_by(|a, b| {
            for ob in &order_by {
                let va = a.get(&ob.field).unwrap_or(&Value::Null);
                let vb = b.get(&ob.field).unwrap_or(&Value::Null);
                let cmp = compare_values(va, vb);
                let cmp = if ob.order_type == "descending" { cmp.reverse() } else { cmp };
                if cmp != std::cmp::Ordering::Equal { return cmp; }
            }
            std::cmp::Ordering::Equal
        });
    }

    let data: Vec<Value> = metadata_rows.into_iter()
        .skip(offset).take(limit)
        .map(|row| if let Some(ref fl) = fields { select_fields(&row, fl) } else { row })
        .collect();

    Ok(build_response(json!(data), &org_store.data_version(), total_count, &request))
}

fn select_fields(row: &Value, fields: &[String]) -> Value {
    if let Value::Object(map) = row {
        let mut s = serde_json::Map::new();
        for f in fields { s.insert(f.clone(), map.get(f).cloned().unwrap_or(Value::Null)); }
        Value::Object(s)
    } else { row.clone() }
}

fn compare_values(a: &Value, b: &Value) -> std::cmp::Ordering {
    match (a, b) {
        (Value::Null, Value::Null) => std::cmp::Ordering::Equal,
        (Value::Null, _) => std::cmp::Ordering::Greater,
        (_, Value::Null) => std::cmp::Ordering::Less,
        (Value::String(sa), Value::String(sb)) => sa.cmp(sb),
        (Value::Number(na), Value::Number(nb)) => na.as_f64().unwrap_or(0.0).partial_cmp(&nb.as_f64().unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal),
        _ => a.to_string().cmp(&b.to_string()),
    }
}

pub fn has_sequence_filters(request: &LapisRequest) -> bool {
    request.nucleotide_mutations.is_some() || request.amino_acid_mutations.is_some()
        || request.nucleotide_insertions.is_some() || request.amino_acid_insertions.is_some()
}

pub fn has_metadata_filters(request: &LapisRequest) -> bool {
    request.filters.iter().any(|(k, _)| !CONTROL_PARAMS.contains(&k.as_str()))
}

pub fn apply_sequence_filters(conn: &duckdb::Connection, accessions: Option<&[String]>, request: &LapisRequest, reference: &ReferenceGenomes) -> Result<Vec<String>, AppError> {
    let mut result: Option<Vec<String>> = accessions.map(|a| a.to_vec());

    if let Some(ref muts) = request.nucleotide_mutations {
        let parsed: Vec<ParsedMutation> = muts.iter().filter_map(|s| query::parse_nuc_mutation(s)).collect();
        if !parsed.is_empty() {
            result = Some(duckdb_query::filter_by_nuc_mutations(conn, result.as_deref(), &parsed, reference)
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence filter error: {}", e)) })?);
        }
    }
    if let Some(ref muts) = request.amino_acid_mutations {
        let parsed: Vec<ParsedMutation> = muts.iter().filter_map(|s| query::parse_aa_mutation(s)).collect();
        if !parsed.is_empty() {
            result = Some(duckdb_query::filter_by_aa_mutations(conn, result.as_deref(), &parsed, reference)
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence filter error: {}", e)) })?);
        }
    }
    if let Some(ref ins) = request.nucleotide_insertions {
        let parsed: Vec<ParsedInsertion> = ins.iter().filter_map(|s| query::parse_insertion(s)).collect();
        if !parsed.is_empty() {
            result = Some(duckdb_query::filter_by_nuc_insertions(conn, result.as_deref(), &parsed)
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence filter error: {}", e)) })?);
        }
    }
    if let Some(ref ins) = request.amino_acid_insertions {
        let parsed: Vec<ParsedInsertion> = ins.iter().filter_map(|s| query::parse_insertion(s)).collect();
        if !parsed.is_empty() {
            result = Some(duckdb_query::filter_by_aa_insertions(conn, result.as_deref(), &parsed)
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal(format!("Sequence filter error: {}", e)) })?);
        }
    }

    match result {
        Some(accs) => Ok(accs),
        None => {
            let mut stmt = conn.prepare("SELECT accession_version FROM metadata")
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
            let rows = stmt.query_map([], |row| row.get(0))
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
            rows.collect::<Result<Vec<String>, _>>()
                .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })
        }
    }
}

pub fn merge_request(query_params: HashMap<String, String>, body: Option<axum::Json<Value>>) -> LapisRequest {
    let mut merged = HashMap::new();
    for (k, v) in &query_params {
        if v.contains(',') && matches!(k.as_str(), "fields"|"nucleotideMutations"|"aminoAcidMutations"|"nucleotideInsertions"|"aminoAcidInsertions") {
            let arr: Vec<Value> = v.split(',').map(|s| Value::String(s.trim().to_string())).collect();
            merged.insert(k.clone(), Value::Array(arr));
        } else {
            merged.insert(k.clone(), Value::String(v.clone()));
        }
    }
    if let Some(axum::Json(body_val)) = body { if let Value::Object(map) = body_val { for (k, v) in map { merged.insert(k, v); } } }
    let nuc_muts = merged.remove("nucleotideMutations").and_then(|v| match v { Value::Array(arr) => Some(arr.into_iter().filter_map(|x| x.as_str().map(String::from)).collect()), Value::String(s) => Some(s.split(',').map(|x| x.trim().to_string()).collect()), _ => None });
    let aa_muts = merged.remove("aminoAcidMutations").and_then(|v| match v { Value::Array(arr) => Some(arr.into_iter().filter_map(|x| x.as_str().map(String::from)).collect()), Value::String(s) => Some(s.split(',').map(|x| x.trim().to_string()).collect()), _ => None });
    let nuc_ins = merged.remove("nucleotideInsertions").and_then(|v| match v { Value::Array(arr) => Some(arr.into_iter().filter_map(|x| x.as_str().map(String::from)).collect()), Value::String(s) => Some(s.split(',').map(|x| x.trim().to_string()).collect()), _ => None });
    let aa_ins = merged.remove("aminoAcidInsertions").and_then(|v| match v { Value::Array(arr) => Some(arr.into_iter().filter_map(|x| x.as_str().map(String::from)).collect()), Value::String(s) => Some(s.split(',').map(|x| x.trim().to_string()).collect()), _ => None });
    LapisRequest { nucleotide_mutations: nuc_muts, amino_acid_mutations: aa_muts, nucleotide_insertions: nuc_ins, amino_acid_insertions: aa_ins, filters: merged }
}

fn parse_order_by(filters: &HashMap<String, Value>) -> Vec<OrderByField> {
    if let Some(val) = filters.get("orderBy") {
        if let Value::Array(arr) = val { return arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect(); }
        if let Value::String(s) = val { return vec![OrderByField { field: s.clone(), order_type: "ascending".to_string() }]; }
    }
    vec![]
}

fn parse_fields(filters: &HashMap<String, Value>) -> Option<Vec<String>> {
    if let Some(val) = filters.get("fields") {
        if let Value::Array(arr) = val { return Some(arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()); }
        if let Value::String(s) = val { return Some(s.split(',').map(|x| x.trim().to_string()).collect()); }
    }
    None
}
