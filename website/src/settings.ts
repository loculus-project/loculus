export const pageSize = 100;

export const hiddenDefaultSearchFilters = [
    { name: 'versionStatus', filterValue: 'LATEST_VERSION', type: 'string' as const },
    { name: 'isRevocation', filterValue: 'false', type: 'string' as const },
];
