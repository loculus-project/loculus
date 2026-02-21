use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct ReleasedRecord {
    pub metadata: HashMap<String, Value>,
    #[serde(default, rename = "unalignedNucleotideSequences")]
    pub unaligned_nucleotide_sequences: HashMap<String, Option<String>>,
    #[serde(default, rename = "alignedNucleotideSequences")]
    pub aligned_nucleotide_sequences: HashMap<String, Option<String>>,
    #[serde(default, rename = "alignedAminoAcidSequences")]
    pub aligned_amino_acid_sequences: HashMap<String, Option<String>>,
    #[serde(default, rename = "nucleotideInsertions")]
    pub nucleotide_insertions: HashMap<String, Vec<String>>,
    #[serde(default, rename = "aminoAcidInsertions")]
    pub amino_acid_insertions: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReferenceGenomes {
    #[serde(default, rename = "nucleotideSequences")]
    pub nucleotide_sequences: Vec<NamedSequence>,
    #[serde(default)]
    pub genes: Vec<NamedSequence>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NamedSequence {
    pub name: String,
    pub sequence: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct LapisRequest {
    #[serde(default, rename = "nucleotideMutations")]
    pub nucleotide_mutations: Option<Vec<String>>,
    #[serde(default, rename = "aminoAcidMutations")]
    pub amino_acid_mutations: Option<Vec<String>>,
    #[serde(default, rename = "nucleotideInsertions")]
    pub nucleotide_insertions: Option<Vec<String>>,
    #[serde(default, rename = "aminoAcidInsertions")]
    pub amino_acid_insertions: Option<Vec<String>>,
    #[serde(flatten)]
    pub filters: HashMap<String, Value>,
}


#[derive(Debug, Serialize, Clone)]
pub struct MutationRecord {
    pub mutation: String,
    pub count: usize,
    pub coverage: usize,
    pub proportion: f64,
    #[serde(rename = "sequenceName")]
    pub sequence_name: Option<String>,
    #[serde(rename = "mutationFrom")]
    pub mutation_from: String,
    #[serde(rename = "mutationTo")]
    pub mutation_to: String,
    pub position: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct InsertionRecord {
    pub insertion: String,
    pub count: usize,
    #[serde(rename = "insertedSymbols")]
    pub inserted_symbols: String,
    pub position: usize,
    #[serde(rename = "sequenceName")]
    pub sequence_name: Option<String>,
}

#[derive(Debug)]
pub enum MutationTo {
    AnyMutation,
    Reference,
    Base(char),
}

#[derive(Debug)]
pub struct ParsedMutation {
    pub segment_or_gene: Option<String>,
    pub position: usize,
    pub to: MutationTo,
}

#[derive(Debug)]
pub struct ParsedInsertion {
    pub segment_or_gene: Option<String>,
    pub position: usize,
    pub inserted: String,
}

#[derive(Debug, Deserialize)]
pub struct OrderByField {
    pub field: String,
    #[serde(default = "default_asc", rename = "type")]
    pub order_type: String,
}

fn default_asc() -> String { "ascending".to_string() }

// Control parameter names that should be skipped during metadata filtering
pub const CONTROL_PARAMS: &[&str] = &[
    "limit", "offset", "fields", "orderBy",
    "nucleotideMutations", "aminoAcidMutations",
    "nucleotideInsertions", "aminoAcidInsertions",
    "minProportion", "downloadAsFile", "downloadFileBasename",
    "dataFormat", "compression",
];
