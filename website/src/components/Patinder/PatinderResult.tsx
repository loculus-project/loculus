import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

type PatinderResultProps = {
    queryHashes: Set<string>;
    minProportionMatched: number;
};

export const PatinderResult = ({ queryHashes, minProportionMatched }: PatinderResultProps) => {
    const { data: database } = useQuery([], downloadFromLoculus);

    const matches = useMemo(() => {
        if (database === undefined || queryHashes.size === 0) {
            return undefined;
        }
        return find(queryHashes, database, minProportionMatched);
    }, [queryHashes, database, minProportionMatched]);

    if (matches === undefined) {
        return null;
    }

    return (
        <div className='mt-6'>
            <div>Found {matches.length} matches:</div>
            <ol className='list-decimal ml-8 mt-4'>
                {matches.map(([entry, proportionMatched]) => (
                    <li>
                        <a href={'/seq/' + entry.accessionVersion}>{entry.submissionId}</a> ({entry.collectionDate},{' '}
                        {entry.location}), matched {(proportionMatched * 100).toFixed(2)}%, submitted by{' '}
                        <a href={'/group/' + entry.groupId}>{entry.groupName}</a>
                    </li>
                ))}
            </ol>
        </div>
    );
};

const loculusLapis = 'https://lapis-microbioinfo-hackathon.loculus.org/salmonella';

type SequenceEntry = {
    accessionVersion: string;
    submissionId: string;
    groupName: string;
    groupId: string;
    collectionDate: string;
    location: string;
    profileHash: Set<string>;
};

async function downloadFromLoculus(): Promise<SequenceEntry[]> {
    const queryUrl = `${loculusLapis}/sample/details?fields=accessionVersion,submissionId,groupName,groupId,collectionDate,location,profileHash`;

    const response = await fetch(queryUrl);

    if (response.ok) {
        const data = await response.json();
        return data.data.map((d: any) => ({
            ...d,
            profileHash: new Set(d.profileHash.split(',')),
        })) as SequenceEntry[];
    } else {
        throw new Error(`Error: Unable to download data from loculus. Status code ${response.status}`);
    }
}

function find(query: Set<string>, database: SequenceEntry[], minProportionMatched: number): [SequenceEntry, number][] {
    const matched: [SequenceEntry, number][] = [];
    for (const databaseEntry of database) {
        const proportionMatched = match(query, databaseEntry.profileHash);
        if (proportionMatched >= minProportionMatched) {
            matched.push([databaseEntry, proportionMatched]);
        }
    }
    matched.sort((a, b) => b[1] - a[1]);
    return matched;
}

function match(query: Set<string>, databaseEntryHashes: Set<string>): number {
    const matchedHashes = new Set([...query].filter((x) => databaseEntryHashes.has(x)));

    const numberMatched = matchedHashes.size;
    return numberMatched / query.size;
}
