use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response, Json};
use serde_json::{json, Value};
use std::io::Write;
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

/// Compress bytes with the requested compression algorithm.
/// Returns (compressed_bytes, encoding_name, file_extension).
pub fn compress_bytes(data: &[u8], compression: &str) -> Option<(Vec<u8>, &'static str, &'static str)> {
    match compression {
        "gzip" => {
            let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(data).ok()?;
            let compressed = encoder.finish().ok()?;
            Some((compressed, "gzip", ".gz"))
        }
        "zstd" => {
            let compressed = zstd::encode_all(std::io::Cursor::new(data), 3).ok()?;
            Some((compressed, "zstd", ".zst"))
        }
        _ => None,
    }
}


/// Build a response in JSON, CSV, or TSV format based on `dataFormat` param.
pub fn build_response(data: Value, data_version: &str, total_count: usize, request: &LapisRequest) -> Response {
    let data_format = request.filters.get("dataFormat")
        .and_then(|v| v.as_str())
        .unwrap_or("json")
        .to_ascii_lowercase();

    let compression = request.filters.get("compression")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut response = match data_format.as_str() {
        "csv" | "tsv" | "csv_without_headers" | "tsv_without_headers" => {
            build_delimited_response(&data, &data_format, request, &compression)
        }
        _ => build_json_response(data, data_version, total_count, &compression),
    };

    if let Ok(val) = data_version.parse() {
        response.headers_mut().insert("Lapis-Data-Version", val);
    }
    response
}

fn build_json_response(data: Value, data_version: &str, total_count: usize, compression: &str) -> Response {
    let body = json!({
        "data": data,
        "info": {
            "dataVersion": data_version,
            "requestId": uuid::Uuid::new_v4().to_string(),
            "requestInfo": format!("Matched {} sequences", total_count),
            "lapisVersion": "sequlus/0.2.0",
        }
    });

    if !compression.is_empty() {
        let json_bytes = serde_json::to_vec(&body).unwrap_or_default();
        if let Some((compressed, encoding, _)) = compress_bytes(&json_bytes, compression) {
            let mut resp = (
                [(header::CONTENT_TYPE, "application/json")],
                compressed,
            ).into_response();
            resp.headers_mut().insert(header::CONTENT_ENCODING, encoding.parse().unwrap());
            return resp;
        }
    }

    Json(body).into_response()
}

fn build_delimited_response(data: &Value, format: &str, request: &LapisRequest, compression: &str) -> Response {
    let (base_format, include_header) = match format {
        "csv_without_headers" => ("csv", false),
        "tsv_without_headers" => ("tsv", false),
        other => (other, true),
    };

    let delimiter = if base_format == "csv" { ',' } else { '\t' };
    let text = values_to_delimited(data, delimiter, include_header);
    let ct = if base_format == "csv" { "text/csv;charset=UTF-8" } else { "text/tab-separated-values;charset=UTF-8" };

    let download = request.filters.get("downloadAsFile").and_then(|v| v.as_str()) == Some("true");
    let basename = request.filters.get("downloadFileBasename")
        .and_then(|v| v.as_str()).unwrap_or("data");

    if !compression.is_empty() {
        if let Some((compressed, encoding, ext)) = compress_bytes(text.as_bytes(), compression) {
            let mut resp = ([(header::CONTENT_TYPE, ct)], compressed).into_response();
            resp.headers_mut().insert(header::CONTENT_ENCODING, encoding.parse().unwrap());
            if download {
                if let Ok(val) = format!("attachment; filename={}.{}{}", basename, base_format, ext).parse() {
                    resp.headers_mut().insert(header::CONTENT_DISPOSITION, val);
                }
            }
            return resp;
        }
    }

    let mut resp = ([(header::CONTENT_TYPE, ct)], text).into_response();
    if download {
        if let Ok(val) = format!("attachment; filename={}.{}", basename, base_format).parse() {
            resp.headers_mut().insert(header::CONTENT_DISPOSITION, val);
        }
    }
    resp
}

fn values_to_delimited(data: &Value, delimiter: char, include_header: bool) -> String {
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
    if include_header {
        output.push_str(&columns.join(&d));
        output.push('\n');
    }

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
