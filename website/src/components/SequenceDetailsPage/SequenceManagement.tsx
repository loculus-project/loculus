import type { FC } from 'react';

import { RevokeButton } from './RevokeButton';
import { type TableDataEntry } from './types';
import { routes } from '../../routes/routes';
import { DATA_USE_TERMS_FIELD, GROUP_ID_FIELD } from '../../settings.ts';
import { type DataUseTermsHistoryEntry, type Group, type RestrictedDataUseTerms } from '../../types/backend';
import { isLatestVersionRevocation, type SequenceEntryHistory, versionStatuses } from '../../types/lapis';
import { getCurrentDataUseTerms } from '../../utils/dataUseTerms.ts';
import { parseAccessionVersionFromString } from '../../utils/extractAccessionVersion.ts';
import { EditDataUseTermsButton } from '../DataUseTerms/EditDataUseTermsButton';
import { Button } from '../common/Button';
import MdiEye from '~icons/mdi/eye';

interface Props {
    isLoggedIn: boolean;
    tableData: TableDataEntry[];
    organism: string;
    accessionVersion: string;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    myGroups: Group[];
    isRevocation?: boolean;
    onRevokeSuccess?: () => void;
}

export const SequenceManagement: FC<Props> = ({
    isLoggedIn,
    tableData,
    organism,
    accessionVersion,
    dataUseTermsHistory,
    sequenceEntryHistory,
    myGroups,
    isRevocation,
    onRevokeSuccess,
}: Props) => {
    const groupId = tableData.find((entry) => entry.name === GROUP_ID_FIELD)!.value as number;
    const isMyGroup = myGroups.some((group) => group.groupId === groupId);

    if (!isMyGroup || !isLoggedIn) return null;

    const isLatestVersion =
        sequenceEntryHistory.find((entry) => entry.accessionVersion === accessionVersion)?.versionStatus ===
        versionStatuses.latestVersion;

    // Display nothing for previous revocations
    if (isRevocation && !isLatestVersion) return null;

    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const currentDataUseTerms = getCurrentDataUseTerms(dataUseTermsHistory);

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
                            Restore this sequence
                        </Button>
                    ) : (
                        <>
                            {isRestricted && currentDataUseTerms !== undefined && (
                                <EditDataUseTermsButton
                                    accession={accession}
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
                            {!isLatestVersionRevocation(sequenceEntryHistory) && (
                                <RevokeButton
                                    organism={organism}
                                    accession={accession}
                                    groupId={groupId}
                                    onRevokeSuccess={onRevokeSuccess}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
};
