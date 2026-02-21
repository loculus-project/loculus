use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response, Json};
use serde_json::{json, Value};
use crate::types::*;

/// LAPIS-compatible error response.
pub struct AppError {
    pub status: StatusCode,
    pub detail: String,
}

impl AppError {
    pub fn not_found(detail: impl Into<String>) -> Self {
        AppError { status: StatusCode::NOT_FOUND, detail: detail.into() }
    }
    pub fn bad_request(detail: impl Into<String>) -> Self {
        AppError { status: StatusCode::BAD_REQUEST, detail: detail.into() }
    }
    pub fn internal(detail: impl Into<String>) -> Self {
        AppError { status: StatusCode::INTERNAL_SERVER_ERROR, detail: detail.into() }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let title = match self.status {
            StatusCode::BAD_REQUEST => "Bad Request",
            StatusCode::NOT_FOUND => "Not Found",
            _ => "Internal Server Error",
        };
        let body = json!({
            "error": {
                "type": "about:blank",
                "title": title,
                "status": self.status.as_u16(),
                "detail": self.detail,
            },
            "info": {
                "dataVersion": Value::Null,
                "requestId": uuid::Uuid::new_v4().to_string(),
                "lapisVersion": "sequlus/0.2.0",
            }
        });
        (self.status, Json(body)).into_response()
    }
}

/// Build a response in JSON, CSV, or TSV format based on `dataFormat` param.
pub fn build_response(data: Value, data_version: &str, total_count: usize, request: &LapisRequest) -> Response {
    let data_format = request.filters.get("dataFormat")
        .and_then(|v| v.as_str())
        .unwrap_or("json");

    let mut response = match data_format {
        "csv" | "tsv" => build_delimited_response(&data, data_format, request),
        _ => build_json_response(data, data_version, total_count),
    };

    if let Ok(val) = data_version.parse() {
        response.headers_mut().insert("Lapis-Data-Version", val);
    }
    response
}

fn build_json_response(data: Value, data_version: &str, total_count: usize) -> Response {
    let body = json!({
        "data": data,
        "info": {
            "dataVersion": data_version,
            "requestId": uuid::Uuid::new_v4().to_string(),
            "requestInfo": format!("Matched {} sequences", total_count),
            "lapisVersion": "sequlus/0.2.0",
        }
    });
    Json(body).into_response()
}

fn build_delimited_response(data: &Value, format: &str, request: &LapisRequest) -> Response {
    let delimiter = if format == "csv" { ',' } else { '\t' };
    let text = values_to_delimited(data, delimiter);
    let ct = if format == "csv" { "text/csv;charset=UTF-8" } else { "text/tab-separated-values;charset=UTF-8" };

    let mut resp = ([(header::CONTENT_TYPE, ct)], text).into_response();

    if request.filters.get("downloadAsFile").and_then(|v| v.as_str()) == Some("true") {
        let basename = request.filters.get("downloadFileBasename")
            .and_then(|v| v.as_str()).unwrap_or("data");
        if let Ok(val) = format!("attachment; filename={}.{}", basename, format).parse() {
            resp.headers_mut().insert(header::CONTENT_DISPOSITION, val);
        }
    }
    resp
}

fn values_to_delimited(data: &Value, delimiter: char) -> String {
    let arr = match data.as_array() {
        Some(a) => a,
        None => return String::new(),
    };
    if arr.is_empty() { return String::new(); }

    // Get column names from the first object
    let columns: Vec<String> = if let Some(Value::Object(map)) = arr.first() {
        map.keys().cloned().collect()
    } else {
        return String::new();
    };

    let d = delimiter.to_string();
    let mut output = String::new();

    // Header row
    output.push_str(&columns.join(&d));
    output.push('\n');

    // Data rows
    for row in arr {
        if let Value::Object(map) = row {
            let vals: Vec<String> = columns.iter().map(|col| {
                match map.get(col) {
                    Some(Value::String(s)) => csv_escape(s, delimiter),
                    Some(Value::Null) | None => String::new(),
                    Some(v) => v.to_string(),
                }
            }).collect();
            output.push_str(&vals.join(&d));
            output.push('\n');
        }
    }
    output
}

fn csv_escape(s: &str, delimiter: char) -> String {
    if s.contains(delimiter) || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
