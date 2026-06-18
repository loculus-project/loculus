// TS port of `_common-metadata.tpl`. The system metadata fields that get
// concatenated onto every organism's metadata before being fed to SILO and
// preprocessing.
import type { CanonicalInstanceConfig } from '../schema/canonicalConfig.ts';

export type CommonMetadataField = Record<string, unknown> & { name: string; type: string };

export function commonMetadata(instance: CanonicalInstanceConfig): CommonMetadataField[] {
    const { name, accessionPrefix, dataUseTerms } = instance;

    const fields: CommonMetadataField[] = [
        {
            name: 'accessionVersion',
            displayName: 'Accession version',
            type: 'string',
            notSearchable: true,
            hideOnSequenceDetailsPage: true,
            includeInDownloadsByDefault: true,
            definition: `The ${name} \`accession\` and \`version\`, uniquely identifying the specific version of the sequence record (e.g. \`${accessionPrefix}000001.1\`).`,
        },
        {
            name: 'accession',
            displayName: 'Accession',
            type: 'string',
            notSearchable: true,
            hideOnSequenceDetailsPage: true,
            definition: `A unique identifier assigned to the sequence record by ${name} (e.g. \`${accessionPrefix}000001\`).`,
        },
        {
            name: 'version',
            displayName: 'Version',
            type: 'int',
            hideOnSequenceDetailsPage: true,
            definition:
                'The version number of the sequence record, incremented each time the sequence is revised.',
        },
        {
            name: 'submissionId',
            displayName: 'Submission ID',
            type: 'string',
            header: 'Submission details',
            orderOnDetailsPage: 5000,
            substringSearch: true,
            includeInDownloadsByDefault: true,
            definition: 'The sample identifier provided by the submitter.',
        },
        {
            name: 'isRevocation',
            displayName: 'Is revocation',
            type: 'boolean',
            autocomplete: true,
            hideOnSequenceDetailsPage: true,
            definition: 'Indicator of whether the sequence record is revoked.',
        },
        {
            name: 'submitter',
            displayName: 'Submitter',
            type: 'string',
            generateIndex: true,
            autocomplete: true,
            hideOnSequenceDetailsPage: true,
            header: 'Submission details',
            orderOnDetailsPage: 5010,
            definition: `Name of the ${name} user who submitted the sequence record.`,
        },
        {
            name: 'groupName',
            type: 'string',
            generateIndex: true,
            autocomplete: true,
            header: 'Submission details',
            displayName: 'Submitting group',
            includeInDownloadsByDefault: true,
            orderOnDetailsPage: 5020,
            definition: 'Name of the group that submitted the sequence record.',
            customDisplay: { type: 'submittingGroup', displayGroup: 'group' },
        },
        {
            name: 'groupId',
            type: 'int',
            autocomplete: true,
            header: 'Submission details',
            displayName: 'Submitting group (numeric ID)',
            orderOnDetailsPage: 5030,
            definition: 'Numeric ID of the group that submitted the sequence record.',
            customDisplay: { type: 'submittingGroup', displayGroup: 'group' },
        },
        {
            name: 'submittedAtTimestamp',
            type: 'timestamp',
            displayName: 'Date submitted',
            header: 'Submission details',
            orderOnDetailsPage: 5040,
            definition: `Date and time on which the sequence record was submitted to ${name}.`,
        },
        {
            name: 'submittedDate',
            type: 'string',
            hideOnSequenceDetailsPage: true,
            generateIndex: true,
            autocomplete: true,
            displayName: 'Date submitted (exact)',
            orderOnDetailsPage: 5050,
            definition: `Date on which the sequence record was submitted to ${name}.`,
        },
        {
            name: 'releasedAtTimestamp',
            type: 'timestamp',
            displayName: 'Date released',
            header: 'Submission details',
            columnWidth: 100,
            orderOnDetailsPage: 5060,
            definition: `Date and time on which the sequence record was released on ${name}.`,
        },
        {
            name: 'releasedDate',
            type: 'string',
            hideOnSequenceDetailsPage: true,
            generateIndex: true,
            autocomplete: true,
            displayName: 'Date released (exact)',
            columnWidth: 100,
            orderOnDetailsPage: 5070,
            definition: `Date on which the sequence record was released on ${name}.`,
        },
    ];

    if (dataUseTerms.enabled) {
        fields.push(
            {
                name: 'dataUseTerms',
                type: 'string',
                generateIndex: true,
                autocomplete: true,
                displayName: 'Data use terms',
                initiallyVisible: true,
                includeInDownloadsByDefault: true,
                definition:
                    'The terms under which the sequence record may be used; either `OPEN` or `RESTRICTED`.',
                customDisplay: { type: 'dataUseTerms' },
                header: 'Data use terms',
                orderOnDetailsPage: 610,
                orderInSearchDisplay: 10,
            },
            {
                name: 'dataUseTermsRestrictedUntil',
                type: 'date',
                displayName: 'Data use terms restricted until',
                hideOnSequenceDetailsPage: true,
                header: 'Data use terms',
                orderOnDetailsPage: 620,
                definition: 'The date until which the sequence record is restricted use.',
            },
            {
                name: 'dataBecameOpenAt',
                type: 'date',
                displayName: 'Date data became open',
                hideOnSequenceDetailsPage: true,
                header: 'Data use terms',
                orderOnDetailsPage: 625,
                definition:
                    'The date on which the sequence record transitioned from restricted to open access.',
            },
        );
        if (dataUseTerms.urls !== null && dataUseTerms.urls !== undefined) {
            fields.push({
                name: 'dataUseTermsUrl',
                displayName: 'Data use terms URL',
                type: 'string',
                notSearchable: true,
                header: 'Data use terms',
                includeInDownloadsByDefault: true,
                definition:
                    'Link to the full text of the data use terms applicable to the sequence record.',
                customDisplay: { type: 'link', url: '__value__' },
                orderOnDetailsPage: 630,
            });
        }
    }

    fields.push(
        {
            name: 'versionStatus',
            displayName: 'Version status',
            type: 'string',
            autocomplete: true,
            hideOnSequenceDetailsPage: true,
            definition:
                'Indicates whether this is the latest version of the sequence record (`LATEST_VERSION`), an earlier version (`REVISED`), or has been revoked (`REVOKED`).',
        },
        {
            name: 'versionComment',
            type: 'string',
            displayName: 'Version comment',
            header: 'Submission details',
            orderOnDetailsPage: 5000,
            definition:
                'Reason for revising sequences, or other general comments concerning a specific version.',
        },
        {
            name: 'pipelineVersion',
            displayName: 'Pipeline version',
            type: 'int',
            notSearchable: true,
            hideOnSequenceDetailsPage: true,
            definition: 'The version of the processing pipeline used to process the sequence record.',
        },
    );

    return fields;
}
