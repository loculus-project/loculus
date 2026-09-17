import type { DataUseTerms, DataUseTermsHistoryEntry } from '../types/backend';

export function sortDataUseTermsHistory(dataUseTermsHistory: DataUseTermsHistoryEntry[]): DataUseTermsHistoryEntry[] {
    return [...dataUseTermsHistory].sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1));
}

export function getCurrentDataUseTerms(dataUseTermsHistory: DataUseTermsHistoryEntry[]): DataUseTerms | undefined {
    const sortedDataUseTermsHistory = sortDataUseTermsHistory(dataUseTermsHistory);
    return sortedDataUseTermsHistory.length > 0 ? sortedDataUseTermsHistory[0].dataUseTerms : undefined;
}
