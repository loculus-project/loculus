import type { FC } from 'react';

import { RevokeButton } from './RevokeButton';
import { type TableDataEntry } from './types';
import { routes } from '../../routes/routes';
import { DATA_USE_TERMS_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group, type RestrictedDataUseTerms } from '../../types/backend';
import { type SequenceEntryHistory, versionStatuses } from '../../types/lapis';
import { type ClientConfig } from '../../types/runtimeConfig';
import { parseAccessionVersionFromString } from '../../utils/extractAccessionVersion.ts';
import { EditDataUseTermsButton } from '../DataUseTerms/EditDataUseTermsButton';
import { Button } from '../common/Button';
import MdiEye from '~icons/mdi/eye';

interface Props {
    tableData: TableDataEntry[];
    organism: string;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    sequenceEntryHistory?: SequenceEntryHistory;
    clientConfig: ClientConfig;
    myGroups: Group[];
    accessToken: string | undefined;
    isRevocation?: boolean;
    onRevokeSuccess?: () => void;
}

export const SequenceManagement: FC<Props> = ({
    tableData,
    organism,
    accessionVersion,
    dataUseTermsHistory,
    sequenceEntryHistory,
    clientConfig,
    myGroups,
    accessToken,
    isRevocation,
    onRevokeSuccess,
}: Props) => {
    const groupId = tableData.find((entry) => entry.name === 'groupId')!.value as number;

    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const isMyGroup = myGroups.some((group) => group.groupId === groupId);

    if (!isMyGroup || accessToken === undefined) {
        return null;
    }

    const ownHistoryEntry = sequenceEntryHistory?.find((entry) => entry.accessionVersion === accessionVersion);
    const isLatestVersion = ownHistoryEntry?.versionStatus === versionStatuses.latestVersion;

    // A revocation entry cannot be revised or revoked itself; the revocation is undone by
    // revising the latest entry that is not a revocation.
    if (isRevocation && !isLatestVersion) {
        return null;
    }

    const currentDataUseTerms = [...dataUseTermsHistory].sort((a, b) => (a.changeDate > b.changeDate ? -1 : 1))[0]
        .dataUseTerms;

    const dataUseTerms = tableData.find((entry) => entry.name === DATA_USE_TERMS_FIELD);
    const isRestricted = dataUseTerms?.value.toString().toUpperCase() === 'RESTRICTED';

    return (
        <>
            <hr className='my-4' />
            <div className='my-8'>
                <h2 className='text-xl font-bold mb-3'>Sequence management</h2>
                <div className='text-sm text-gray-400 mb-4 block'>
                    <MdiEye className='w-6 h-6 inline-block mr-2' />
                    Only visible to group members
                </div>

                <div className='flex flex-wrap gap-3'>
                    {isRevocation ? (
                        <Button as='a' size='sm' href={routes.revisePage(organism, groupId, 'form', accession)}>
                            Undo revocation
                        </Button>
                    ) : (
                        <>
                            {isRestricted && (
                                <EditDataUseTermsButton
                                    clientConfig={clientConfig}
                                    accessToken={accessToken}
                                    accessionVersion={[accession]}
                                    dataUseTerms={currentDataUseTerms as RestrictedDataUseTerms}
                                />
                            )}

                            <Button
                                as='a'
                                size='sm'
                                href={routes.revisePage(organism, groupId, 'form', accession, version?.toString())}
                            >
                                Revise this sequence
                            </Button>
                            <RevokeButton
                                organism={organism}
                                clientConfig={clientConfig}
                                accessionVersion={accession}
                                accessToken={accessToken}
                                groupId={groupId}
                                onRevokeSuccess={onRevokeSuccess}
                            />
                        </>
                    )}
                </div>
            </div>
        </>
    );
};
