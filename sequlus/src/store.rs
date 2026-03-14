use crate::types::ReferenceGenomes;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct OrganismStore {
    pub duckdb: Mutex<duckdb::Connection>,
    pub reference: ReferenceGenomes,
    pub data_version: Mutex<String>,
    pub organism_name: String,
}

impl OrganismStore {
    pub fn data_version(&self) -> String {
        self.data_version.lock().unwrap().clone()
    }
}

pub struct DataStore {
    pub organisms: HashMap<String, OrganismStore>,
    pub pg_pool: sqlx::PgPool,
    /// Lineage definitions: "organism/column" → parsed JSON lineage definition
    pub lineage_definitions: HashMap<String, serde_json::Value>,
}

pub type SharedStore = Arc<DataStore>;
