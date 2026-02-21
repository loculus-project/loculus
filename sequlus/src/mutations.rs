use bitvec::prelude::*;

fn is_known_nuc(c: char) -> bool {
    matches!(c, 'A' | 'C' | 'G' | 'T' | '-')
}

/// Compute nucleotide mutations for a single aligned sequence vs reference.
/// Returns (mutations, coverage_bitmap).
pub fn compute_nuc_mutations_for_record(
    aligned_seq: &str,
    ref_seq: &str,
) -> (Vec<(usize, char, char)>, BitVec<u8, Msb0>) {
    let ref_chars: Vec<char> = ref_seq.chars().collect();
    let seq_chars: Vec<char> = aligned_seq.chars().collect();
    let rlen = ref_chars.len();
    let mut muts = Vec::new();
    let mut cov = bitvec![u8, Msb0; 0; rlen];
    let l = rlen.min(seq_chars.len());
    for p in 0..l {
        let rb = ref_chars[p].to_ascii_uppercase();
        let sb = seq_chars[p].to_ascii_uppercase();
        if rb == 'N' { continue; }
        if is_known_nuc(sb) {
            cov.set(p, true);
            if sb != rb { muts.push((p, rb, sb)); }
        }
    }
    (muts, cov)
}

/// Compute amino acid mutations for a single aligned sequence vs reference.
pub fn compute_aa_mutations_for_record(
    aligned_seq: &str,
    ref_seq: &str,
) -> (Vec<(usize, char, char)>, BitVec<u8, Msb0>) {
    let ref_chars: Vec<char> = ref_seq.chars().collect();
    let seq_chars: Vec<char> = aligned_seq.chars().collect();
    let rlen = ref_chars.len();
    let mut muts = Vec::new();
    let mut cov = bitvec![u8, Msb0; 0; rlen];
    let l = rlen.min(seq_chars.len());
    for p in 0..l {
        let ra = ref_chars[p];
        let sa = seq_chars[p];
        if sa != 'X' && sa != '.' {
            cov.set(p, true);
            if sa != ra { muts.push((p, ra, sa)); }
        }
    }
    (muts, cov)
}
