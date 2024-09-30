import { useState, type FC, type FormEvent } from 'react';

import {
    AddressLineOneInput,
    AddressLineTwoInput,
    CityInput,
    CountryInput,
    EmailContactInput,
    GroupNameInput,
    InstitutionNameInput,
    PostalCodeInput,
    StateInput,
} from './Inputs';
import useClientFlag from '../../hooks/isClient';
import type { NewGroup } from '../../types/backend';
import { ErrorFeedback } from '../ErrorFeedback.tsx';

interface GroupFormProps {
    title: string;
    buttonText: string;
    defaultGroupData?: NewGroup;
    onSubmit: (group: NewGroup) => Promise<GroupSubmitResult>;
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

const chooseCountry = 'Choose a country...';

export const GroupForm: FC<GroupFormProps> = ({ title, buttonText, defaultGroupData, onSubmit }) => {
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const internalOnSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        const groupName = formData.get(fieldMapping.groupName.id) as string;
        const institution = formData.get(fieldMapping.institution.id) as string;
        const contactEmail = formData.get(fieldMapping.contactEmail.id) as string;
        const country = formData.get(fieldMapping.country.id) as string;
        const line1 = formData.get(fieldMapping.line1.id) as string;
        const line2 = formData.get(fieldMapping.line2.id) as string;
        const city = formData.get(fieldMapping.city.id) as string;
        const state = formData.get(fieldMapping.state.id) as string;
        const postalCode = formData.get(fieldMapping.postalCode.id) as string;

        if (country === chooseCountry) {
            setErrorMessage('Please choose a country');
            return false;
        }

        const group: NewGroup = {
            groupName,
            institution,
            contactEmail,
            address: { line1, line2, city, postalCode, state, country },
        };

        const result = await onSubmit(group);

        if (result.succeeded) {
            window.location.href = result.nextPageHref;
        } else {
            setErrorMessage(result.errorMessage);
        }
    };

    const isClient = useClientFlag();

    return (
        <div className='p-4 max-w-6xl mx-auto'>
            <h2 className='title'>{title}</h2>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <form onSubmit={internalOnSubmit}>
                <div className='border-b border-gray-900/10 pb-12 '>
                    <p className='mt-1 text-sm leading-6 text-gray-600'>
                        The information you enter on this form will be publicly available on your group page.
                    </p>

                    <div className='mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6'>
                        <GroupNameInput defaultValue={defaultGroupData?.groupName} />
                        <EmailContactInput defaultValue={defaultGroupData?.contactEmail} />
                        <InstitutionNameInput defaultValue={defaultGroupData?.institution} />
                        <AddressLineOneInput defaultValue={defaultGroupData?.address.line1} />
                        <AddressLineTwoInput defaultValue={defaultGroupData?.address.line2} />
                        <CityInput defaultValue={defaultGroupData?.address.city} />
                        <StateInput defaultValue={defaultGroupData?.address.state} />
                        <PostalCodeInput defaultValue={defaultGroupData?.address.postalCode} />
                        <CountryInput defaultValue={defaultGroupData?.address.country} />
                    </div>

                    <div className='flex justify-end py-8 gap-4 '>
                        <button
                            type='submit'
                            className='btn btn-primary px-4 py-2 loculusColor text-white rounded'
                            disabled={!isClient}
                        >
                            {buttonText}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

const fieldMapping = {
    groupName: {
        id: 'group-name',
        required: true,
    },
    institution: {
        id: 'institution-name',
        required: true,
    },
    contactEmail: {
        id: 'email',
        required: true,
    },
    country: {
        id: 'country',
        required: true,
    },
    line1: {
        id: 'address-line-1',
        required: true,
    },
    line2: {
        id: 'address-line-2',
        required: false,
    },
    city: {
        id: 'city',
        required: true,
    },
    state: {
        id: 'state',
        required: false,
    },
    postalCode: {
        id: 'postal-code',
        required: true,
    },
} as const;
