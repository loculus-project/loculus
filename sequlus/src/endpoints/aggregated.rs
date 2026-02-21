use axum::extract::{Path, Query, State};
use axum::response::Response;
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::error;
use crate::pg_query;
use crate::response::{AppError, build_response};

use crate::store::SharedStore;
use crate::endpoints::details::{merge_request, apply_sequence_filters, has_sequence_filters};

pub async fn handle_aggregated(State(store): State<SharedStore>, Path(organism): Path<String>, Query(query_params): Query<HashMap<String, String>>, body: Option<axum::Json<Value>>) -> Result<Response, AppError> {
    let org_store = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let request = merge_request(query_params, body);
    let fields = if let Some(val) = request.filters.get("fields") { if let Value::Array(arr) = val { arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>() } else if let Value::String(s) = val { s.split(',').map(|x| x.trim().to_string()).collect() } else { vec![] } } else { vec![] };

    let seq_filtered = if has_sequence_filters(&request) {
        let filtered = {
            let conn = org_store.duckdb.lock().unwrap();
            apply_sequence_filters(&conn, None, &request, &org_store.reference)?
        };
        Some(filtered)
    } else {
        None
    };

    let result = pg_query::get_aggregated(&store.pg_pool, &request, &organism, &fields, seq_filtered.as_deref())
        .await.map_err(|e| { error!("Postgres: {}", e); AppError::internal(format!("Database error: {}", e)) })?;

    if fields.is_empty() {
        let count = result.first().map(|(_, c)| *c).unwrap_or(0) as usize;
        return Ok(build_response(json!([{"count": count}]), &org_store.data_version(), count, &request));
    }

    let total_count: i64 = result.iter().map(|(_, c)| c).sum();
    let data: Vec<Value> = result.into_iter().map(|(v, _)| v).collect();
    Ok(build_response(json!(data), &org_store.data_version(), total_count as usize, &request))
}
