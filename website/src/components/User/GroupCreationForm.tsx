import { type ComponentProps, type FC, type FormEvent, type PropsWithChildren, useState } from 'react';

import { listOfCountries } from './listOfCountries.ts';
import useClientFlag from '../../hooks/isClient.ts';
import { useGroupCreation } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

interface GroupManagerProps {
    clientConfig: ClientConfig;
    accessToken: string;
}

const chooseCountry = 'Choose a country...';

const InnerGroupCreationForm: FC<GroupManagerProps> = ({ clientConfig, accessToken }) => {
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const { createGroup } = useGroupCreation({
        clientConfig,
        accessToken,
    });

    const handleCreateGroup = async (e: FormEvent<HTMLFormElement>) => {
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

        const result = await createGroup({
            groupName,
            institution,
            contactEmail,
            address: { line1, line2, city, postalCode, state, country },
        });

        if (result.succeeded) {
            window.location.href = routes.groupOverviewPage(result.group.groupId);
        } else {
            setErrorMessage(result.errorMessage);
        }
    };

    const isClient = useClientFlag();

    return (
        <div className='p-4 max-w-6xl mx-auto'>
            <h2 className='title'>Create a new submitting group</h2>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <form onSubmit={handleCreateGroup}>
                <div className='border-b border-gray-900/10 pb-12 '>
                    <p className='mt-1 text-sm leading-6 text-gray-600'>
                        Fill out following form to create a new submitting group.
                    </p>

                    <p className='mt-1 text-sm leading-6 text-red-600'>
                        Please note that the information you enter on this form will be publicly available on your group
                        page.
                    </p>

                    <div className='mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6'>
                        <GroupNameInput />
                        <EmailContactInput />
                        <InstitutionNameInput />
                        <AddressLineOneInput />
                        <AddressLineTwoInput />
                        <CityInput />
                        <StateInput />
                        <PostalCodeInput />
                        <CountryInput />
                    </div>

                    <div className='flex justify-end py-8 gap-4 '>
                        <button
                            type='submit'
                            className='btn btn-primary px-4 py-2 loculusColor text-white rounded'
                            disabled={!isClient}
                        >
                            Create group
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export const GroupCreationForm = withQueryProvider(InnerGroupCreationForm);

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

const groupCreationCssClass =
    'block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:text-sm sm:leading-6';

type LabelledInputContainerProps = PropsWithChildren<{
    label: string;
    htmlFor: string;
    className: string;
    required?: boolean;
}>;

const LabelledInputContainer: FC<LabelledInputContainerProps> = ({ children, label, htmlFor, className, required }) => (
    <div className={className}>
        <label htmlFor={htmlFor} className='block text-sm font-medium leading-6 text-gray-900'>
            {label}
            {required === true && <span className='ml-1 text-red-600'>*</span>}
        </label>
        <div className='mt-1'>{children}</div>
    </div>
);

type TextInputProps = {
    className: string;
    label: string;
    name: string;
    fieldMappingKey: keyof typeof fieldMapping;
    type: ComponentProps<'input'>['type'];
};

const TextInput: FC<TextInputProps> = ({ className, label, name, fieldMappingKey, type }) => (
    <LabelledInputContainer
        className={className}
        label={label}
        htmlFor={name}
        required={fieldMapping[fieldMappingKey].required}
    >
        <input
            type={type}
            name={name}
            required={fieldMapping[fieldMappingKey].required}
            id={fieldMapping[fieldMappingKey].id}
            className={groupCreationCssClass}
            autoComplete={type === 'email' ? 'email' : undefined}
        />
    </LabelledInputContainer>
);

const GroupNameInput = () => (
    <TextInput className='sm:col-span-4' type='text' label='Group name' name='group-name' fieldMappingKey='groupName' />
);

const InstitutionNameInput = () => (
    <TextInput
        className='sm:col-span-4'
        type='text'
        label='Institution'
        name='institution-name'
        fieldMappingKey='institution'
    />
);

const EmailContactInput = () => (
    <TextInput
        className='sm:col-span-4'
        type='email'
        label='Contact email address'
        name='email'
        fieldMappingKey='contactEmail'
    />
);

const CountryInput = () => (
    <LabelledInputContainer label='Country' htmlFor='country' className='sm:col-span-3' required>
        <select
            id={fieldMapping.country.id}
            name='country'
            required={fieldMapping.country.required}
            autoComplete='country-name'
            className='block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:max-w-xs sm:text-sm sm:leading-6'
        >
            <option>{chooseCountry}</option>
            {listOfCountries.map((country) => (
                <option key={country}>{country}</option>
            ))}
        </select>
    </LabelledInputContainer>
);

const AddressLineOneInput = () => (
    <TextInput
        className='col-span-full'
        type='text'
        label='Address Line 1'
        name='address-line-1'
        fieldMappingKey='line1'
    />
);

const AddressLineTwoInput = () => (
    <TextInput
        className='col-span-full'
        type='text'
        label='Address Line 2'
        name='address-line-2'
        fieldMappingKey='line2'
    />
);

const CityInput = () => (
    <TextInput className='sm:col-span-2 sm:col-start-1' type='text' label='City' name='city' fieldMappingKey='city' />
);

const StateInput = () => (
    <TextInput className='sm:col-span-2' type='text' label='State / Province' name='state' fieldMappingKey='state' />
);

const PostalCodeInput = () => (
    <TextInput
        className='sm:col-span-2'
        type='text'
        label='ZIP / Postal code'
        name='postal-code'
        fieldMappingKey='postalCode'
    />
);
