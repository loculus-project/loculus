import type { Action } from './common.ts';

function getExampleData(randomEntries = 20) {
    const regions = ['Europe', 'Asia', 'North America', 'South America', 'Africa', 'Australia'];
    const countries = ['Switzerland', 'USA', 'China', 'Brazil', 'Nigeria', 'Australia'];
    const divisions = ['Bern', 'California', 'Beijing', 'Rio de Janeiro', 'Lagos', 'Sydney'];
    const hosts = ['Homo sapiens', 'Canis lupus familiaris'];

    let metadataContent = 'submissionId\tdate\tregion\tcountry\tdivision\thost\n';
    let revisedMetadataContent = 'accession\tsubmissionId\tdate\tregion\tcountry\tdivision\thost\n';
    let sequenceContent = '';

    for (let i = 0; i < randomEntries; i++) {
        const submissionId = `custom${i}`;
        const date = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000))
            .toISOString()
            .split('T')[0];
        const region = regions[Math.floor(Math.random() * regions.length)];
        const country = countries[Math.floor(Math.random() * countries.length)];
        const division = divisions[Math.floor(Math.random() * divisions.length)];
        const host = hosts[Math.floor(Math.random() * hosts.length)];

        metadataContent += `${submissionId}\t${date}\t${region}\t${country}\t${division}\t${host}\n`;
        revisedMetadataContent += `${i + 1}\t${submissionId}\t${date}\t${region}\t${country}\t${division}\t${host}\n`;
        sequenceContent += `>${submissionId}\nACTG\n`;
    }

    return {
        metadataFileContent: metadataContent,
        revisedMetadataFileContent: revisedMetadataContent,
        sequenceFileContent: sequenceContent,
    };
}

function createTempFile(content: BlobPart, mimeType: any, fileName: string) {
    const blob = new Blob([content], { type: mimeType });
    return new File([blob], fileName, { type: mimeType });
}

export function getExampleFiles(numberEntries: number | undefined, action: Action) {
    const { metadataFileContent, revisedMetadataFileContent, sequenceFileContent } = getExampleData(numberEntries);

    const exampleMetadataContent = action === `submit` ? metadataFileContent : revisedMetadataFileContent;

    const metadataFile = createTempFile(exampleMetadataContent, 'text/tab-separated-values', 'metadata.tsv');
    const sequenceFile = createTempFile(sequenceFileContent, 'application/octet-stream', 'sequences.fasta');

    return { metadataFile, sequenceFile };
}
