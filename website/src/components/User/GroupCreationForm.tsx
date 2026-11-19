import { type FC, useMemo } from 'react';

import { routes } from '../../routes/routes.ts';
import type { ContinueSubmissionIntent } from '../../routes/routes.ts';
import { backendApi } from '../../services/backendApi.ts';
import type { NewGroup } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { GroupForm } from '../Group/GroupForm.tsx';
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
    const backend = backendApi(clientConfig.backendUrl, accessToken);
    const continueSubmission = useMemo(() => getContinueSubmissionFromSearchParams(searchParams), [searchParams]);

    const handleCreateGroup = async (group: NewGroup) => {
        const createdGroup = await backend.createGroup(group);
        return routes.groupOverviewPage(createdGroup.groupId, continueSubmission);
    };

    return (
        <GroupForm
            title='Create a new submitting group'
            buttonText='Create group'
            onSubmit={handleCreateGroup}
            getGroups={(name) => backend.getGroups({ name })}
        />
    );
};

export const GroupCreationForm = withQueryProvider(InnerGroupCreationForm);
