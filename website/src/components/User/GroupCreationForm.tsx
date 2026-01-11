import { type FC, useMemo } from 'react';

import { useGetGroups, useGroupCreation } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { ContinueSubmissionIntent } from '../../routes/routes.ts';
import type { NewGroup } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { GroupForm, type GroupSubmitError, type GroupSubmitSuccess } from '../Group/GroupForm.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

interface GroupManagerProps {
    clientConfig: ClientConfig;
    accessToken: string;
    searchParams: string;
}

const getContinueSubmissionFromSearchParams = (searchParamsString: string): ContinueSubmissionIntent | undefined => {
    const searchParams = new URLSearchParams(searchParamsString);
    const organism = searchParams.get('continueSubmissionOrganism');
    if (organism === null) {
        return undefined;
    }

    return { organism };
};

const InnerGroupCreationForm: FC<GroupManagerProps> = ({ clientConfig, accessToken, searchParams }) => {
    const { getGroups } = useGetGroups({
        clientConfig,
        accessToken,
    });
    const { createGroup } = useGroupCreation({
        clientConfig,
        accessToken,
    });

    const continueSubmission = useMemo(() => getContinueSubmissionFromSearchParams(searchParams), [searchParams]);

    const handleCreateGroup = async (group: NewGroup) => {
        const result = await createGroup(group);

        if (result.succeeded) {
            return {
                succeeded: true,
                nextPageHref: routes.groupOverviewPage(result.group.groupId, continueSubmission),
            } as GroupSubmitSuccess;
        } else {
            return {
                succeeded: false,
                errorMessage: result.errorMessage,
            } as GroupSubmitError;
        }
    };

    return (
        <GroupForm
            title='Create a new submitting group'
            buttonText='Create group'
            onSubmit={handleCreateGroup}
            getGroups={getGroups}
        />
    );
};

export const GroupCreationForm = withQueryProvider(InnerGroupCreationForm);
