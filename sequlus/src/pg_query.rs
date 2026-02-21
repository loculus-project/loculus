use serde_json::Value;
use crate::types::{LapisRequest, CONTROL_PARAMS};

/// Build a Postgres WHERE clause from LAPIS request filters.
/// Returns (where_clause_string, bind_values).
pub fn build_metadata_filter(
    request: &LapisRequest,
    organism: &str,
) -> (String, Vec<String>) {
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    bind_values.push(organism.to_string());
    conditions.push(format!("se.organism = ${}", bind_values.len()));
    conditions.push("se.released_at IS NOT NULL".to_string());

    for (key, value) in &request.filters {
        if CONTROL_PARAMS.contains(&key.as_str()) { continue; }

        if key.ends_with(".regex") {
            let field_name = &key[..key.len() - 6];
            if let Some(pattern) = value.as_str() {
                bind_values.push(pattern.to_string());
                conditions.push(format!(
                    "sepd.processed_data->'metadata'->>'{field}' ~ ${n}",
                    field = escape_field(field_name), n = bind_values.len()
                ));
            }
            continue;
        }

        if key.ends_with("From") {
            let field_name = &key[..key.len() - 4];
            if let Some(val) = value_to_string(value) {
                bind_values.push(val);
                conditions.push(format!(
                    "sepd.processed_data->'metadata'->>'{field}' >= ${n}",
                    field = escape_field(field_name), n = bind_values.len()
                ));
            }
            continue;
        }

        if key.ends_with("To") {
            let field_name = &key[..key.len() - 2];
            if let Some(val) = value_to_string(value) {
                bind_values.push(val);
                conditions.push(format!(
                    "sepd.processed_data->'metadata'->>'{field}' <= ${n}",
                    field = escape_field(field_name), n = bind_values.len()
                ));
            }
            continue;
        }

        if value.is_null() {
            conditions.push(format!(
                "sepd.processed_data->'metadata'->>'{field}' IS NULL",
                field = escape_field(key)
            ));
            continue;
        }

        if let Some(arr) = value.as_array() {
            if arr.is_empty() { continue; }
            let values: Vec<String> = arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            if values.is_empty() { continue; }
            let placeholders: Vec<String> = values.iter().map(|v| {
                bind_values.push(v.clone());
                format!("${}", bind_values.len())
            }).collect();
            conditions.push(format!(
                "sepd.processed_data->'metadata'->>'{field}' IN ({phs})",
                field = escape_field(key), phs = placeholders.join(", ")
            ));
            continue;
        }

        if let Some(b) = value.as_bool() {
            let val_str = if b { "true" } else { "false" };
            bind_values.push(val_str.to_string());
            conditions.push(format!(
                "sepd.processed_data->'metadata'->>'{field}' = ${n}",
                field = escape_field(key), n = bind_values.len()
            ));
            continue;
        }

        if let Some(val) = value_to_string(value) {
            bind_values.push(val);
            conditions.push(format!(
                "sepd.processed_data->'metadata'->>'{field}' = ${n}",
                field = escape_field(key), n = bind_values.len()
            ));
        }
    }

    let where_clause = if conditions.is_empty() {
        "TRUE".to_string()
    } else {
        conditions.join(" AND ")
    };

    (where_clause, bind_values)
}

/// Build an additional SQL clause restricting by accession_version.
/// Returns empty string if None.
fn acc_version_clause(accession_versions: Option<&[String]>) -> String {
    match accession_versions {
        None => String::new(),
        Some(accs) if accs.is_empty() => " AND FALSE".to_string(),
        Some(accs) => {
            let vals: Vec<String> = accs.iter()
                .map(|a| format!("'{}'", a.replace('\'', "''")))
                .collect();
            format!(" AND (se.accession || '.' || se.version) IN ({})", vals.join(","))
        }
    }
}

const BASE_JOIN: &str = "\
    FROM sequence_entries se \
    LEFT JOIN current_processing_pipeline cpp \
      ON cpp.organism = se.organism \
    LEFT JOIN sequence_entries_preprocessed_data sepd \
      ON se.accession = sepd.accession \
      AND se.version = sepd.version \
      AND sepd.pipeline_version = cpp.version";

/// Get accession versions matching metadata filters from Postgres.
/// Optionally restrict to a pre-filtered set of accession_versions (from DuckDB).
pub async fn get_filtered_accessions(
    pool: &sqlx::PgPool,
    request: &LapisRequest,
    organism: &str,
    accession_versions: Option<&[String]>,
) -> Result<Vec<String>, sqlx::Error> {
    let (where_clause, bind_values) = build_metadata_filter(request, organism);
    let av_clause = acc_version_clause(accession_versions);

    let sql = format!(
        "SELECT se.accession || '.' || se.version as accession_version {BASE_JOIN} WHERE {where_clause}{av_clause}"
    );

    let mut query = sqlx::query_scalar::<_, String>(&sql);
    for val in &bind_values { query = query.bind(val); }
    query.fetch_all(pool).await
}

/// Get accession versions + metadata JSON from Postgres.
/// Optionally restrict to a pre-filtered set of accession_versions.
pub async fn get_metadata_details(
    pool: &sqlx::PgPool,
    request: &LapisRequest,
    organism: &str,
    accession_versions: Option<&[String]>,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    let (where_clause, bind_values) = build_metadata_filter(request, organism);
    let av_clause = acc_version_clause(accession_versions);

    let sql = format!(
        "SELECT se.accession || '.' || se.version as accession_version, \
                COALESCE(sepd.processed_data->'metadata', '{{}}'::jsonb)::text as metadata \
         {BASE_JOIN} WHERE {where_clause}{av_clause}"
    );

    let mut query = sqlx::query_as::<_, (String, String)>(&sql);
    for val in &bind_values { query = query.bind(val); }
    query.fetch_all(pool).await
}

/// Get count of matching metadata from Postgres.
pub async fn get_filtered_count(
    pool: &sqlx::PgPool,
    request: &LapisRequest,
    organism: &str,
    accession_versions: Option<&[String]>,
) -> Result<i64, sqlx::Error> {
    let (where_clause, bind_values) = build_metadata_filter(request, organism);
    let av_clause = acc_version_clause(accession_versions);

    let sql = format!(
        "SELECT COUNT(*) {BASE_JOIN} WHERE {where_clause}{av_clause}"
    );

    let mut query = sqlx::query_scalar::<_, i64>(&sql);
    for val in &bind_values { query = query.bind(val); }
    query.fetch_one(pool).await
}

/// Get metadata JSON grouped by fields for the aggregated endpoint.
pub async fn get_aggregated(
    pool: &sqlx::PgPool,
    request: &LapisRequest,
    organism: &str,
    fields: &[String],
    accession_versions: Option<&[String]>,
) -> Result<Vec<(serde_json::Value, i64)>, sqlx::Error> {
    let (where_clause, bind_values) = build_metadata_filter(request, organism);
    let av_clause = acc_version_clause(accession_versions);

    if fields.is_empty() {
        let count = get_filtered_count(pool, request, organism, accession_versions).await?;
        return Ok(vec![(serde_json::json!({"count": count}), count)]);
    }

    let field_selects: Vec<String> = fields.iter().map(|f| {
        format!("sepd.processed_data->'metadata'->>'{field}' as \"{field}\"", field = escape_field(f))
    }).collect();

    let group_by: Vec<String> = (1..=fields.len()).map(|i| i.to_string()).collect();

    let sql = format!(
        "SELECT {selects}, COUNT(*) as cnt \
         {BASE_JOIN} WHERE {where_clause}{av_clause} \
         GROUP BY {group_by} \
         ORDER BY cnt DESC",
        selects = field_selects.join(", "),
        group_by = group_by.join(", ")
    );

    let mut query = sqlx::query(&sql);
    for val in &bind_values { query = query.bind(val); }

    let rows = query.fetch_all(pool).await?;

    let mut result = Vec::new();
    for row in &rows {
        use sqlx::Row;
        let mut obj = serde_json::Map::new();
        for f in fields {
            let val: Option<String> = row.get(f.as_str());
            match val {
                Some(s) => obj.insert(f.clone(), serde_json::Value::String(s)),
                None => obj.insert(f.clone(), serde_json::Value::Null),
            };
        }
        let count: i64 = row.get("cnt");
        obj.insert("count".to_string(), serde_json::json!(count));
        result.push((serde_json::Value::Object(obj), count));
    }

    Ok(result)
}

fn escape_field(field: &str) -> String {
    field.replace('\'', "''").replace('"', "")
}

fn value_to_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}
