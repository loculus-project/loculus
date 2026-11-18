export function withOrganismPathSegment<Path extends `/${string}`>(path: Path) {
    return `/:organism${path}` as const;
}
