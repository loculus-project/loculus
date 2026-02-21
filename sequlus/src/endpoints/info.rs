use axum::extract::{Path, State};
use axum::response::{Json, Response, IntoResponse};
use serde_json::json;
use tracing::error;
use crate::response::AppError;
use crate::store::SharedStore;

pub async fn handle_info(State(store): State<SharedStore>, Path(organism): Path<String>) -> Result<Response, AppError> {
    let org = store.organisms.get(&organism)
        .ok_or_else(|| AppError::not_found(format!("Unknown organism: {}", organism)))?;
    let data_version = org.data_version();
    let count = {
        let c = org.duckdb.lock().unwrap();
        let mut stmt = c.prepare("SELECT COUNT(*) FROM metadata")
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })?;
        stmt.query_row([], |row| row.get::<_, i64>(0))
            .map_err(|e| { error!("DuckDB: {}", e); AppError::internal("DuckDB error") })? as usize
    };
    let body = json!({
        "data": {
            "dataVersion": data_version,
            "lapisVersion": "sequlus/0.2.0",
            "organism": org.organism_name,
            "sequenceCount": count,
        },
        "info": {
            "dataVersion": data_version,
            "requestId": uuid::Uuid::new_v4().to_string(),
            "requestInfo": "Info endpoint",
            "lapisVersion": "sequlus/0.2.0",
        }
    });
    let mut resp = Json(body).into_response();
    if let Ok(val) = data_version.parse() {
        resp.headers_mut().insert("Lapis-Data-Version", val);
    }
    Ok(resp)
}
