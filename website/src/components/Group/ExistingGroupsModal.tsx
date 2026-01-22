import type { FC } from 'react';

import type { Group, NewGroup } from '../../types/backend';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

type ExistingGroupsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    newGroup: NewGroup;
    existingGroups: Group[];
    submitFromModal: (newGroup: NewGroup) => Promise<void>;
    isSubmitting: boolean;
};

export const ExistingGroupsModal: FC<ExistingGroupsModalProps> = ({
    isOpen,
    onClose,
    title,
    newGroup,
    existingGroups,
    submitFromModal,
    isSubmitting,
}) => {
    return (
        <BaseDialog title={title} isOpen={isOpen} onClose={onClose} fullWidth={false}>
            <div className='min-w-[1000px]'></div>

            <p className='mb-4'>
                One or more groups with the name <span className='font-semibold'>"{newGroup.groupName}"</span> already
                exist. Please choose another group name or make a request to join an existing group using the contact
                information provided in the table below.
            </p>

            <p className='mb-4'>
                Alternatively, you may proceed with creating an additional group called{' '}
                <span className='font-semibold'>"{newGroup.groupName}"</span>, though this is not recommended.
            </p>

            <div className='overflow-x-auto max-h-[150px]'>
                <table className='w-full border border-gray-200 rounded-md'>
                    <thead className='bg-gray-50'>
                        <tr>
                            <th className='px-4 py-2 text-left text-sm font-medium text-gray-600'>Group name</th>
                            <th className='px-4 py-2 text-left text-sm font-medium text-gray-600'>Institute</th>
                            <th className='px-4 py-2 text-left text-sm font-medium text-gray-600'>Email</th>
                        </tr>
                    </thead>

                    <tbody>
                        {existingGroups.map((group) => (
                            <tr key={group.groupId} className='border-t hover:bg-gray-50'>
                                <td className='px-4 py-2 text-sm text-gray-800'>{group.groupName}</td>
                                <td className='px-4 py-2 text-sm text-gray-800'>{group.institution}</td>
                                <td className='px-4 py-2 text-sm text-gray-800'>{group.contactEmail}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className='mt-4 flex justify-center'>
                <Button
                    type='button'
                    className='btn loculusColor text-white'
                    onClick={() => void submitFromModal(newGroup)}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Creating group...' : `Create additional group called "${newGroup.groupName}"`}
                </Button>
            </div>
        </BaseDialog>
    );
};
