import { describe, expect, it } from 'vitest';

import {
    getDateFormatFromData,
    getGraphData,
    getGraphTimeProperties,
    groupByDateFormat,
    groupRemainingPoints,
} from './SeqSetPlots';

describe('getGraphData', () => {
    it('maps values and counts, and accumulates empty values', () => {
        const data = [
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
            { value: null, count: 3 },
            { value: '', count: 2 },
        ];
        const { graphData, emptyCount } = getGraphData(data);
        expect(graphData.labels).toEqual(['USA', 'Germany']);
        expect(graphData.datasets[0].data).toEqual([10, 5]);
        expect(emptyCount).toBe(5);
    });

    it('returns empty labels and data for empty input', () => {
        const { graphData, emptyCount } = getGraphData([]);
        expect(graphData.labels).toEqual([]);
        expect(graphData.datasets[0].data).toEqual([]);
        expect(emptyCount).toBe(0);
    });
});

describe('getDateFormatFromData', () => {
    it('returns yyyy for mixed resolutions more than 365 days apart', () => {
        const data = [
            { value: '2022-01', count: 1 },
            { value: '2024-01-01', count: 1 },
        ];
        expect(getDateFormatFromData(data)).toBe('yyyy');
    });

    it('returns yyyy-MM for mixed resolutions between 60 and 365 days apart', () => {
        const data = [
            { value: '2024', count: 1 },
            { value: '2024-06-01', count: 1 },
        ];
        expect(getDateFormatFromData(data)).toBe('yyyy-MM');
    });

    it('returns yyyy-MM-dd for dates within 60 days of each other', () => {
        const data = [
            { value: '2024-01', count: 1 },
            { value: '2024-02-02', count: 1 },
        ];
        expect(getDateFormatFromData(data)).toBe('yyyy-MM-dd');
    });

    it('returns yyyy-MM-dd for a single date', () => {
        expect(getDateFormatFromData([{ value: '2024-03-15', count: 1 }])).toBe('yyyy-MM-dd');
    });

    it('returns yyyy-MM-dd for empty data', () => {
        expect(getDateFormatFromData([])).toBe('yyyy-MM-dd');
    });

    it('ignores rows with non-string or invalid date values', () => {
        const data = [
            { value: null, count: 1 },
            { value: 'not-a-date', count: 1 },
            { value: '2024-01-01', count: 1 },
        ];
        expect(getDateFormatFromData(data)).toBe('yyyy-MM-dd');
    });
});

describe('groupByDateFormat', () => {
    it('handles grouping dates of mixed resolutions by yyyy', () => {
        const data = [
            { value: '2022', count: 3 },
            { value: '2022-01', count: 4 },
            { value: '2022-06-15', count: 2 },
            { value: '2023', count: 1 },
            { value: '2023-01', count: 2 },
            { value: '2023-04-04', count: 1 },
        ];
        const result = groupByDateFormat(data, 'yyyy');
        expect(result).toEqual([
            { value: '2022', count: 9 },
            { value: '2023', count: 4 },
        ]);
    });

    it('handles grouping dates of mixed resolutions by yyyy-MM', () => {
        const data = [
            { value: '2024', count: 1 },
            { value: '2024-01', count: 2 },
            { value: '2024-01-15', count: 3 },
            { value: '2024-02-01', count: 1 },
            { value: '2025', count: 1 },
            { value: '2025-01', count: 1 },
            { value: '2025-02-10', count: 1 },
        ];
        const result = groupByDateFormat(data, 'yyyy-MM');
        expect(result).toEqual([
            { value: '2024-01', count: 6 },
            { value: '2024-02', count: 1 },
            { value: '2025-01', count: 2 },
            { value: '2025-02', count: 1 },
        ]);
    });

    it('handles grouping dates of mixed resolutions by yyyy-MM-dd', () => {
        const data = [
            { value: '2024', count: 1 },
            { value: '2024-01', count: 4 },
            { value: '2024-01-15', count: 3 },
            { value: '2024-02-01', count: 1 },
            { value: '2025', count: 1 },
            { value: '2025-01', count: 1 },
            { value: '2025-02-10', count: 1 },
        ];
        const result = groupByDateFormat(data, 'yyyy-MM-dd');
        expect(result).toEqual([
            { value: '2024-01-01', count: 5 },
            { value: '2024-01-15', count: 3 },
            { value: '2024-02-01', count: 1 },
            { value: '2025-01-01', count: 2 },
            { value: '2025-02-10', count: 1 },
        ]);
    });

    it('skips rows with non-string or invalid date values', () => {
        const data = [
            { value: null, count: 99 },
            { value: 'not-a-date', count: 99 },
            { value: '2024-03-01', count: 1 },
            { value: '2024-03-15', count: 1 },
        ];
        const result = groupByDateFormat(data, 'yyyy-MM');
        expect(result).toEqual([{ value: '2024-03', count: 2 }]);
    });

    it('returns empty array for empty input', () => {
        expect(groupByDateFormat([], 'yyyy-MM')).toEqual([]);
    });
});

describe('getGraphTimeProperties', () => {
    it('returns day properties for yyyy-MM-dd', () => {
        expect(getGraphTimeProperties('yyyy-MM-dd')).toEqual({
            unit: 'day',
            displayFormats: { day: 'dd MMM yyyy' },
            tooltipFormat: 'yyyy-MM-dd',
        });
    });

    it('returns month properties for yyyy-MM', () => {
        expect(getGraphTimeProperties('yyyy-MM')).toEqual({
            unit: 'month',
            displayFormats: { month: 'MMM yyyy' },
            tooltipFormat: 'yyyy-MM',
        });
    });

    it('returns year properties for yyyy', () => {
        expect(getGraphTimeProperties('yyyy')).toEqual({
            unit: 'year',
            displayFormats: { year: 'yyyy' },
            tooltipFormat: 'yyyy',
        });
    });
});

describe('groupRemainingPoints', () => {
    it('returns all rows unchanged when count is within cutoff', () => {
        const data = [
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
        ];
        expect(groupRemainingPoints(data, 10)).toEqual([
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
        ]);
    });

    it('groups rows beyond cutoff into an Others entry', () => {
        const data = [
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
            { value: 'France', count: 3 },
            { value: 'Spain', count: 2 },
        ];
        const result = groupRemainingPoints(data, 2);
        expect(result).toEqual([
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
            { value: 'Others (2)', count: 5 },
        ]);
    });

    it('sorts by count descending before applying cutoff', () => {
        const data = [
            { value: 'Spain', count: 2 },
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
        ];
        const [first, second] = groupRemainingPoints(data, 2);
        expect(first.value).toBe('USA');
        expect(second.value).toBe('Germany');
    });

    it('omits Others entry when all rows fit within cutoff', () => {
        const data = [
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 5 },
        ];
        const result = groupRemainingPoints(data, 2);
        expect(result.find((r) => String(r.value).startsWith('Others'))).toBeUndefined();
    });

    it('returns empty array for empty input', () => {
        expect(groupRemainingPoints([], 10)).toEqual([]);
    });
});
