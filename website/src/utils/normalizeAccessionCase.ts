// Loculus accessions consist of a fixed prefix followed by digits (and, for
// SeqSets, an `SS_` segment). When the configured accession prefix is
// all-uppercase, the only letters an accession can contain are that fixed
// prefix, so accessions are effectively case-insensitive. In that case we
// normalize a user-supplied accession (version) to uppercase so that, e.g.,
// `pp_00123` resolves to the same entry as `PP_00123`.
//
// If a deployment configures a prefix that itself contains lowercase letters,
// the input is left untouched to avoid breaking a mixed-case scheme.
export function normalizeAccessionCase(accessionVersion: string, accessionPrefix: string): string {
    const prefixIsUppercase = /[A-Z]/.test(accessionPrefix) && !/[a-z]/.test(accessionPrefix);
    return prefixIsUppercase ? accessionVersion.toUpperCase() : accessionVersion;
}
