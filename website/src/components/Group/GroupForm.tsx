import { useState, type FC, type FormEvent } from 'react';

import { ExistingGroupsModal } from './ExistingGroupsModal.tsx';
import {
    AddressLineOneInput,
    AddressLineTwoInput,
    CityInput,
    CountryInput,
    CountryInputNoOptionChosen,
    EmailContactInput,
    GroupNameInput,
    InstitutionNameInput,
    PostalCodeInput,
    StateInput,
    groupFromFormData,
} from './Inputs';
import { type GetGroupsResult } from '../../hooks/useGroupOperations.ts';
import { type Group, type NewGroup } from '../../types/backend';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { Button } from '../common/Button';

const PLACEHOLDER_NEWGROUP: NewGroup = {
    groupName: '',
    institution: '',
    address: {
        line1: '',
        city: '',
        postalCode: '',
        country: '',
    },
    contactEmail: '',
};

interface GroupFormProps {
    /**
     * The title above the form fields.
     */
    title: string;
    /**
     * The text on the button at the bottom of the field (i.e. "create" or "update").
     */
    buttonText: string;
    /**
     * The default values to fill into the fields of the form.
     */
    defaultGroupData?: NewGroup;
    /**
     * Provide this when editing existing group to prevent 'existing group alert'
     * for the group that's currently being edited
     */
    editingGroupId?: number;
    /**
     * A handler to call when the button is clicked (i.e. create or update a group).
     * @param group The new group information entered into the form.
     * @returns A submit success or error.
     */
    onSubmit: (group: NewGroup) => Promise<GroupSubmitResult>;
    /**
     * Handler that can be used to check if the name of the group being created is
     * already in use by another group in the database.
     * @param groupName Group name to filter the results by
     * @returns A result object where the `groups` property
     *          is an array of existing Groups
     */
    getGroups: (groupName?: string) => Promise<GetGroupsResult>;
}

export type GroupSubmitSuccess = {
    succeeded: true;
    nextPageHref: string;
};
export type GroupSubmitError = {
    succeeded: false;
    errorMessage: string;
};
export type GroupSubmitResult = GroupSubmitSuccess | GroupSubmitError;

export const GroupForm: FC<GroupFormProps> = ({
    title,
    buttonText,
    defaultGroupData,
    editingGroupId,
    onSubmit,
    getGroups,
}) => {
    const [currentGroup, setCurrentGroup] = useState<NewGroup>(PLACEHOLDER_NEWGROUP);
    const [existingGroups, setExistingGroups] = useState<Group[]>([]);
    const [isExistingGroupModalOpen, setIsExistingGroupModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const submitGroup = async (group: NewGroup): Promise<void> => {
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            const result = await onSubmit(group);

            if (result.succeeded) {
                window.location.href = result.nextPageHref;
            } else {
                setErrorMessage(result.errorMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitFromForm = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const group = groupFromFormData(formData);
        setCurrentGroup(group);

        if (group.address.country === CountryInputNoOptionChosen) {
            setErrorMessage('Please choose a country');
            return;
        }

        const existingGroupsResult = await getGroups(group.groupName);
        if (existingGroupsResult.succeeded) {
            const existingGroups = existingGroupsResult.groups.filter((group) => group.groupId !== editingGroupId);
            if (existingGroups.length === 0) {
                await submitGroup(group);
                return;
            }
            setExistingGroups(existingGroups);
            setIsExistingGroupModalOpen(true);
        } else {
            setErrorMessage(existingGroupsResult.errorMessage);
        }
    };

    const submitFromModal = async (group: NewGroup) => {
        // Checks have already been done in `submitFromForm`, so we can just submit here
        await submitGroup(group);
    };

    return (
        <div className='p-4 max-w-6xl mx-auto'>
            <h2 className='title'>{title}</h2>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <form onSubmit={(event) => void submitFromForm(event)}>
                <div className='border-b border-gray-900/10 pb-12 '>
                    <p className='mt-1 text-sm leading-6 text-gray-600'>
                        The information you enter on this form will be publicly available on your group page.
                    </p>

                    <div className='mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6'>
                        <GroupNameInput defaultValue={defaultGroupData?.groupName} />
                        <EmailContactInput defaultValue={defaultGroupData?.contactEmail ?? ''} />
                        <InstitutionNameInput defaultValue={defaultGroupData?.institution} />
                        <AddressLineOneInput defaultValue={defaultGroupData?.address.line1} />
                        <AddressLineTwoInput defaultValue={defaultGroupData?.address.line2} />
                        <CityInput defaultValue={defaultGroupData?.address.city} />
                        <StateInput defaultValue={defaultGroupData?.address.state} />
                        <PostalCodeInput defaultValue={defaultGroupData?.address.postalCode} />
                        <CountryInput defaultValue={defaultGroupData?.address.country} />
                    </div>

                    <div className='flex justify-end py-8 gap-4 '>
                        <Button type='submit' className='btn btn-primary px-4 py-2 loculusColor text-white rounded'>
                            {buttonText}
                        </Button>
                    </div>
                    <ExistingGroupsModal
                        title='Group name already in use!'
                        isOpen={isExistingGroupModalOpen}
                        onClose={() => setIsExistingGroupModalOpen(false)}
                        newGroup={currentGroup}
                        existingGroups={existingGroups}
                        submitFromModal={submitFromModal}
                        isSubmitting={isSubmitting}
                    />
                </div>
            </form>
        </div>
    );
};
