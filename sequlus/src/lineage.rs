use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::{info, warn};

/// Parse a LINEAGE_CONFIG env var and download/parse lineage definition YAML files.
///
/// LINEAGE_CONFIG format: JSON object mapping "organism/column" to {"pipeline_version": "url"}.
/// Example: {"ebola-sudan/pangoLineage": {"1": "https://example.com/lineage.yaml"}}
///
/// Returns a map of "organism/column" → parsed JSON lineage definition.
pub async fn load_lineage_definitions(
    pg_pool: &sqlx::PgPool,
    organisms: &[String],
) -> HashMap<String, Value> {
    let mut result = HashMap::new();

    let config_str = match std::env::var("LINEAGE_CONFIG") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            info!("No LINEAGE_CONFIG env var set, lineage definitions will be empty");
            return result;
        }
    };

    let config: HashMap<String, HashMap<String, String>> = match serde_json::from_str(&config_str) {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to parse LINEAGE_CONFIG: {}", e);
            return result;
        }
    };

    // Get current pipeline versions from Postgres
    let mut pipeline_versions: HashMap<String, i64> = HashMap::new();
    for organism in organisms {
        let version: Option<i64> = sqlx::query_scalar(
            "SELECT version FROM current_processing_pipeline WHERE organism = $1"
        )
        .bind(organism)
        .fetch_optional(pg_pool)
        .await
        .ok()
        .flatten();

        if let Some(v) = version {
            pipeline_versions.insert(organism.clone(), v);
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();

    for (key, version_urls) in &config {
        // key is "organism/column"
        let organism = key.split('/').next().unwrap_or("");
        let pipeline_version = pipeline_versions.get(organism).map(|v| v.to_string());

        // Try current pipeline version, then fall back to any available version
        let url = pipeline_version.as_ref()
            .and_then(|v| version_urls.get(v))
            .or_else(|| version_urls.values().next());

        let url = match url {
            Some(u) => u,
            None => {
                warn!("No lineage definition URL found for {}", key);
                continue;
            }
        };

        info!("Downloading lineage definition for {} from {}", key, url);
        match download_and_parse_yaml(&client, url).await {
            Ok(def) => {
                info!("Loaded lineage definition for {} ({} entries)", key, def.as_object().map(|o| o.len()).unwrap_or(0));
                result.insert(key.clone(), def);
            }
            Err(e) => {
                warn!("Failed to load lineage definition for {}: {}", key, e);
            }
        }
    }

    result
}

async fn download_and_parse_yaml(
    client: &reqwest::Client,
    url: &str,
) -> Result<Value, Box<dyn std::error::Error>> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()).into());
    }
    let body = resp.text().await?;

    // Parse YAML into the lineage definition format
    let yaml: HashMap<String, YamlLineageEntry> = serde_yaml::from_str(&body)?;

    let mut result = serde_json::Map::new();
    for (name, entry) in yaml {
        result.insert(name, json!({
            "parents": entry.parents.unwrap_or_default(),
            "aliases": entry.aliases.unwrap_or_default(),
        }));
    }

    Ok(Value::Object(result))
}

#[derive(serde::Deserialize)]
struct YamlLineageEntry {
    parents: Option<Vec<String>>,
    aliases: Option<Vec<String>>,
}
