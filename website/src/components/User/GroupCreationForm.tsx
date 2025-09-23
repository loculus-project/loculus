import { type FC, useMemo } from 'react';

import { useGroupCreation } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { ContinueSubmissionIntent } from '../../routes/routes.ts';
import type { NewGroup } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { GroupForm, type GroupSubmitError, type GroupSubmitSuccess } from '../Group/GroupForm.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

interface GroupManagerProps {
    clientConfig: ClientConfig;
    accessToken: string;
}

const getContinueSubmissionFromLocation = (): ContinueSubmissionIntent | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const organism = searchParams.get('continueSubmissionOrganism');
    if (organism === null) {
        return undefined;
    }

    return { organism };
};

const InnerGroupCreationForm: FC<GroupManagerProps> = ({ clientConfig, accessToken }) => {
    const { createGroup } = useGroupCreation({
        clientConfig,
        accessToken,
    });

    const continueSubmission = useMemo(() => getContinueSubmissionFromLocation(), []);

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

    return <GroupForm title='Create a new submitting group' buttonText='Create group' onSubmit={handleCreateGroup} />;
};

export const GroupCreationForm = withQueryProvider(InnerGroupCreationForm);
