import { type FC } from 'react';

import { routes } from '../../routes/routes.ts';
import { browserBackendApi } from '../../services/backendApi.ts';
import type { GroupDetails, NewGroup } from '../../types/backend.ts';
import { GroupForm } from '../Group/GroupForm.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

interface GroupEditFormProps {
    prefetchedGroupDetails: GroupDetails;
}

const InnerGroupEditForm: FC<GroupEditFormProps> = ({ prefetchedGroupDetails }) => {
    const { groupId, ...groupInfo } = prefetchedGroupDetails.group;

    const backend = browserBackendApi();

    const handleEditGroup = async (group: NewGroup) => {
        const editedGroup = await backend.editGroup({ groupId, ...group });
        return routes.groupOverviewPage(editedGroup.groupId);
    };

    return (
        <GroupForm
            title='Edit group'
            buttonText='Update group'
            onSubmit={handleEditGroup}
            defaultGroupData={groupInfo}
            editingGroupId={groupId}
            getGroups={(name) => backend.getGroups({ name })}
        />
    );
};

export const GroupEditForm = withQueryProvider(InnerGroupEditForm);
