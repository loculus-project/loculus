import { type FC } from 'react';

import { useGetGroups, useGroupEdit } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { GroupDetails, NewGroup } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { GroupForm, type GroupSubmitError, type GroupSubmitSuccess } from '../Group/GroupForm.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

interface GroupEditFormProps {
    prefetchedGroupDetails: GroupDetails;
    clientConfig: ClientConfig;
    accessToken: string;
}

const InnerGroupEditForm: FC<GroupEditFormProps> = ({ prefetchedGroupDetails, clientConfig, accessToken }) => {
    const { groupId, ...groupInfo } = prefetchedGroupDetails.group;

    const { getGroups } = useGetGroups({
        clientConfig,
        accessToken,
    });
    const { editGroup } = useGroupEdit({
        clientConfig,
        accessToken,
    });

    const handleEditGroup = async (group: NewGroup) => {
        const result = await editGroup(groupId, group);

        if (result.succeeded) {
            return {
                succeeded: true,
                nextPageHref: routes.groupOverviewPage(result.group.groupId),
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
            title='Edit group'
            buttonText='Update group'
            onSubmit={handleEditGroup}
            defaultGroupData={groupInfo}
            editingGroupId={groupId}
            getGroups={getGroups}
        />
    );
};

export const GroupEditForm = withQueryProvider(InnerGroupEditForm);
