mod config;
mod duckdb_query;
mod endpoints;
mod loader;
mod mutations;
mod pg_query;
mod query;
mod response;
mod server;
mod store;
mod types;

use clap::Parser;
use config::Config;
use std::path::Path;
use std::sync::{Arc, Mutex};
use store::{DataStore, OrganismStore, SharedStore};
use tracing::{error, info, warn};

/// Build a fingerprint string that changes whenever data changes for an organism.
/// Combines: pipeline version + released sequence count + latest release timestamp.
async fn query_fingerprint(pool: &sqlx::PgPool, organism: &str) -> Result<String, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT COALESCE((SELECT MAX(started_using_at)::text FROM current_processing_pipeline WHERE organism = $1), 'none') \
         || '|' || \
         COALESCE((SELECT COUNT(*)::text || '|' || MAX(released_at)::text FROM sequence_entries WHERE organism = $1 AND released_at IS NOT NULL), '0|none')"
    )
    .bind(organism)
    .fetch_one(pool)
    .await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let config = Config::parse();
    info!("Starting sequlus with config: {:?}", config);

    std::fs::create_dir_all(&config.data_dir)?;

    let pg_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    info!("Connected to Postgres");

    let organisms: Vec<String> = if let Some(ref orgs) = config.organisms {
        orgs.split(',').map(|s| s.trim().to_string()).collect()
    } else {
        loader::discover_organisms(&config.reference_genomes_dir)?
    };

    info!("Loading organisms: {:?}", organisms);

    let mut organism_stores = std::collections::HashMap::new();

    for organism in &organisms {
        let ref_path = Path::new(&config.reference_genomes_dir).join(format!("{}.json", organism));
        let reference = match loader::load_reference_genomes(&ref_path) {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to load reference genomes for {} from {:?}: {}", organism, ref_path, e);
                continue;
            }
        };

        info!("Running ETL for {}...", organism);
        match loader::etl_organism(&config.backend_url, organism, &reference, &config.data_dir).await {
            Ok(conn) => {
                let count: i64 = conn.prepare("SELECT COUNT(*) FROM metadata").and_then(|mut s| s.query_row([], |row| row.get(0))).unwrap_or(0);
                info!("Loaded {} with {} sequences into DuckDB", organism, count);

                let data_version: String = sqlx::query_scalar(
                    "SELECT COALESCE(MAX(started_using_at)::text, 'unknown') FROM current_processing_pipeline WHERE organism = $1"
                )
                .bind(organism)
                .fetch_one(&pg_pool)
                .await
                .unwrap_or_else(|_| "unknown".to_string());

                organism_stores.insert(organism.clone(), OrganismStore {
                    duckdb: Mutex::new(conn),
                    reference,
                    data_version: Mutex::new(data_version),
                    organism_name: organism.clone(),
                });
            }
            Err(e) => {
                error!("Failed ETL for {}: {}", organism, e);
            }
        }
    }

    let shared_state: SharedStore = Arc::new(DataStore {
        organisms: organism_stores,
        pg_pool: pg_pool.clone(),
    });

    // Spawn auto-refresh background task
    let refresh_state = shared_state.clone();
    let refresh_interval = config.refresh_interval_secs;
    let backend_url = config.backend_url.clone();
    let data_dir = config.data_dir.clone();
    let ref_genomes_dir = config.reference_genomes_dir.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(refresh_interval));
        interval.tick().await; // skip first immediate tick

        // Track fingerprints locally — combines pipeline version + released count + latest release
        // so we detect both reprocessing AND newly released sequences
        let mut fingerprints: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        for organism in refresh_state.organisms.keys() {
            if let Ok(fp) = query_fingerprint(&refresh_state.pg_pool, organism).await {
                fingerprints.insert(organism.clone(), fp);
            }
        }

        loop {
            interval.tick().await;
            for (organism, org_store) in &refresh_state.organisms {
                let new_fp = match query_fingerprint(&refresh_state.pg_pool, organism).await {
                    Ok(v) => v,
                    Err(e) => {
                        warn!("Refresh check failed for {}: {}", organism, e);
                        continue;
                    }
                };

                let current_fp = fingerprints.get(organism.as_str()).cloned().unwrap_or_default();
                if new_fp == current_fp { continue; }

                info!("Data changed for {} ({} -> {}), re-running ETL...", organism, current_fp, new_fp);

                let ref_path = Path::new(&ref_genomes_dir).join(format!("{}.json", organism));
                let reference = match loader::load_reference_genomes(&ref_path) {
                    Ok(r) => r,
                    Err(e) => { error!("Refresh: failed to load reference for {}: {}", organism, e); continue; }
                };

                // Delete existing DuckDB file to force fresh ETL
                let db_path = Path::new(&data_dir).join(format!("{}.duckdb", organism));
                let _ = std::fs::remove_file(&db_path);
                let _ = std::fs::remove_file(db_path.with_extension("duckdb.wal"));

                // ETL result contains !Send types (duckdb::Connection, Box<dyn Error>).
                // Fully consume it before any subsequent .await.
                let etl_ok = match loader::etl_organism(&backend_url, organism, &reference, &data_dir).await {
                    Ok(new_conn) => {
                        let count: i64 = new_conn.prepare("SELECT COUNT(*) FROM metadata")
                            .and_then(|mut s| s.query_row([], |row| row.get(0))).unwrap_or(0);
                        {
                            let mut duckdb = org_store.duckdb.lock().unwrap();
                            *duckdb = new_conn;
                        }
                        info!("Refresh: reloaded {} with {} sequences", organism, count);
                        true
                    }
                    Err(e) => {
                        error!("Refresh: ETL failed for {}: {}", organism, e);
                        false
                    }
                };

                if etl_ok {
                    let display_version: String = sqlx::query_scalar(
                        "SELECT COALESCE(MAX(started_using_at)::text, 'unknown') FROM current_processing_pipeline WHERE organism = $1"
                    )
                    .bind(organism)
                    .fetch_one(&refresh_state.pg_pool)
                    .await
                    .unwrap_or_else(|_| "unknown".to_string());

                    {
                        let mut version = org_store.data_version.lock().unwrap();
                        *version = display_version;
                    }
                    fingerprints.insert(organism.clone(), new_fp);
                }
            }
        }
    });

    let app = server::create_router(shared_state);

    let addr = format!("0.0.0.0:{}", config.port);
    info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
