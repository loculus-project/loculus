import { describe } from "vitest";
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from "../../types/lapis";


describe('SequenceEntryHistoryMenu', () => {

    const baseEntry: SequenceEntryHistoryEntry = {
        submittedAtTimestamp: "",
        accession: "",
        version: 0,
        accessionVersion: "",
        versionStatus: "REVOKED",
        isRevocation: false
    };

    const historyRevised: SequenceEntryHistory = [
        { ...baseEntry, accessionVersion: 'FOO.1', versionStatus: 'REVISED', isRevocation: false },
        { ...baseEntry, accessionVersion: 'FOO.2', versionStatus: 'LATEST_VERSION', isRevocation: false },
    ];

    // TODO add some testing


    const historyRevoke: SequenceEntryHistory = [
        { ...baseEntry, accessionVersion: 'BAR.1', versionStatus: 'REVISED', isRevocation: false },
        { ...baseEntry, accessionVersion: 'BAR.2', versionStatus: 'LATEST_VERSION', isRevocation: true },
    ];

    // TODO add some testing


});