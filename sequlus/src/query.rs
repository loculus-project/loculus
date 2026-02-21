use crate::types::*;

pub fn parse_nuc_mutation(s: &str) -> Option<ParsedMutation> {
    let (seg, rest) = if let Some(p) = s.find(':') { (Some(s[..p].to_string()), &s[p+1..]) } else { (None, s) };
    let chars: Vec<char> = rest.chars().collect();
    if chars.is_empty() { return None; }
    let si = if chars[0].is_alphabetic() || chars[0] == '-' { 1 } else { 0 };
    let mut pe = si;
    while pe < chars.len() && chars[pe].is_ascii_digit() { pe += 1; }
    if pe == si { return None; }
    let pos: usize = rest[si..pe].parse().ok()?;
    let to = if pe < chars.len() {
        let c = chars[pe].to_ascii_uppercase();
        if c == '.' { MutationTo::Reference } else { MutationTo::Base(c) }
    } else { MutationTo::AnyMutation };
    Some(ParsedMutation { segment_or_gene: seg, position: pos.saturating_sub(1), to })
}

pub fn parse_aa_mutation(s: &str) -> Option<ParsedMutation> {
    let p = s.find(':')?;
    let gene = s[..p].to_string();
    let rest = &s[p+1..];
    let chars: Vec<char> = rest.chars().collect();
    if chars.is_empty() { return None; }
    let si = if chars[0].is_alphabetic() || chars[0] == '-' || chars[0] == '*' { 1 } else { 0 };
    let mut pe = si;
    while pe < chars.len() && chars[pe].is_ascii_digit() { pe += 1; }
    if pe == si { return None; }
    let pos: usize = rest[si..pe].parse().ok()?;
    let to = if pe < chars.len() {
        let c = chars[pe].to_ascii_uppercase();
        if c == '.' { MutationTo::Reference } else { MutationTo::Base(c) }
    } else { MutationTo::AnyMutation };
    Some(ParsedMutation { segment_or_gene: Some(gene), position: pos.saturating_sub(1), to })
}

pub fn parse_insertion(s: &str) -> Option<ParsedInsertion> {
    let rest = s.strip_prefix("ins_")?;
    let parts: Vec<&str> = rest.splitn(3, ':').collect();
    match parts.len() {
        2 => Some(ParsedInsertion { segment_or_gene: None, position: parts[0].parse().ok()?, inserted: parts[1].to_uppercase() }),
        3 => Some(ParsedInsertion { segment_or_gene: Some(parts[0].to_string()), position: parts[1].parse().ok()?, inserted: parts[2].to_uppercase() }),
        _ => None,
    }
}
