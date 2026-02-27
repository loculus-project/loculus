use axum::{Router, Json, routing::{get, post}};
use tower_http::cors::CorsLayer;

use crate::store::SharedStore;
use crate::endpoints::{details, aggregated, mutations, insertions, sequences, info};

async fn health() -> &'static str {
    "OK"
}

async fn lineage_definition() -> Json<serde_json::Value> {
    Json(serde_json::json!({}))
}

pub fn create_router(state: SharedStore) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/{organism}/sample/details", post(details::handle_details).get(details::handle_details))
        .route("/{organism}/sample/aggregated", post(aggregated::handle_aggregated).get(aggregated::handle_aggregated))
        .route("/{organism}/sample/nucleotideMutations", post(mutations::handle_nucleotide_mutations).get(mutations::handle_nucleotide_mutations))
        .route("/{organism}/sample/aminoAcidMutations", post(mutations::handle_amino_acid_mutations).get(mutations::handle_amino_acid_mutations))
        .route("/{organism}/sample/nucleotideInsertions", post(insertions::handle_nucleotide_insertions).get(insertions::handle_nucleotide_insertions))
        .route("/{organism}/sample/aminoAcidInsertions", post(insertions::handle_amino_acid_insertions).get(insertions::handle_amino_acid_insertions))
        .route("/{organism}/sample/unalignedNucleotideSequences", post(sequences::handle_unaligned_nuc_sequences).get(sequences::handle_unaligned_nuc_sequences))
        .route("/{organism}/sample/unalignedNucleotideSequences/{segment}", post(sequences::handle_unaligned_nuc_sequences_seg).get(sequences::handle_unaligned_nuc_sequences_seg))
        .route("/{organism}/sample/alignedNucleotideSequences", post(sequences::handle_aligned_nuc_sequences).get(sequences::handle_aligned_nuc_sequences))
        .route("/{organism}/sample/alignedNucleotideSequences/{segment}", post(sequences::handle_aligned_nuc_sequences_seg).get(sequences::handle_aligned_nuc_sequences_seg))
        .route("/{organism}/sample/alignedAminoAcidSequences/{gene}", post(sequences::handle_aligned_aa_sequences).get(sequences::handle_aligned_aa_sequences))
        .route("/{organism}/sample/lineageDefinition/{column}", get(lineage_definition))
        .route("/{organism}/sample/info", get(info::handle_info))
        .layer(CorsLayer::permissive())
        .with_state(state)
}
