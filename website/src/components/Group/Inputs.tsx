import { type ComponentProps, type FC, type PropsWithChildren } from 'react';

import { listOfCountries } from './listOfCountries.ts';
import type { NewGroup } from '../../types/backend.ts';

export const CountryInputNoOptionChosen = 'Choose a country...';

const fieldMapping = {
    groupName: 'group-name',
    institution: 'institution-name',
    contactEmail: 'email',
    country: 'country',
    line1: 'address-line-1',
    line2: 'address-line-2',
    city: 'city',
    state: 'state',
    postalCode: 'postal-code',
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
    required: boolean;
    type: ComponentProps<'input'>['type'];
    defaultValue?: string;
};

const TextInput: FC<TextInputProps> = ({ className, label, name, required, type, defaultValue }) => (
    <LabelledInputContainer className={className} label={label} htmlFor={name + '-input'} required={required}>
        <input
            type={type}
            name={name}
            id={name + '-input'}
            required={required}
            className={groupCreationCssClass}
            autoComplete={type === 'email' ? 'email' : undefined}
            defaultValue={defaultValue}
        />
    </LabelledInputContainer>
);

type GroupNameInputProps = {
    defaultValue?: string;
};

export const GroupNameInput: FC<GroupNameInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-4'
        type='text'
        label='Group name'
        name={fieldMapping.groupName}
        required
        defaultValue={defaultValue}
    />
);

type InstitutionNameInputProps = {
    defaultValue?: string;
};

export const InstitutionNameInput: FC<InstitutionNameInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-4'
        type='text'
        label='Institution'
        name={fieldMapping.institution}
        required
        defaultValue={defaultValue}
    />
);

type EmailContactInputProps = {
    defaultValue?: string;
};

export const EmailContactInput: FC<EmailContactInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-4'
        type='email'
        label='Contact email address'
        name={fieldMapping.contactEmail}
        required
        defaultValue={defaultValue}
    />
);

type CountryInputProps = {
    defaultValue?: string;
};

export const CountryInput: FC<CountryInputProps> = ({ defaultValue }) => (
    <LabelledInputContainer label='Country' htmlFor='country-input' className='sm:col-span-3' required>
        <select
            id={fieldMapping.country + '-input'}
            name={fieldMapping.country}
            required
            autoComplete='country-name'
            className='block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:max-w-xs sm:text-sm sm:leading-6'
            defaultValue={defaultValue}
        >
            <option>{CountryInputNoOptionChosen}</option>
            {listOfCountries.map((country) => (
                <option key={country} value={country}>
                    {country}
                </option>
            ))}
        </select>
    </LabelledInputContainer>
);

type AddressLineOneInputProps = {
    defaultValue?: string;
};

export const AddressLineOneInput: FC<AddressLineOneInputProps> = ({ defaultValue }) => (
    <TextInput
        className='col-span-full'
        type='text'
        label='Address Line 1'
        name={fieldMapping.line1}
        required
        defaultValue={defaultValue}
    />
);

type AddressLineTwoInputProps = {
    defaultValue?: string;
};

export const AddressLineTwoInput: FC<AddressLineTwoInputProps> = ({ defaultValue }) => (
    <TextInput
        className='col-span-full'
        type='text'
        label='Address Line 2'
        name={fieldMapping.line2}
        required={false}
        defaultValue={defaultValue}
    />
);

type CityInputProps = {
    defaultValue?: string;
};

export const CityInput: FC<CityInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-2 sm:col-start-1'
        type='text'
        label='City'
        name={fieldMapping.city}
        required
        defaultValue={defaultValue}
    />
);

type StateInputProps = {
    defaultValue?: string;
};

export const StateInput: FC<StateInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-2'
        type='text'
        label='State / Province'
        name={fieldMapping.state}
        required={false}
        defaultValue={defaultValue}
    />
);

type PostalCodeInputProps = {
    defaultValue?: string;
};

export const PostalCodeInput: FC<PostalCodeInputProps> = ({ defaultValue }) => (
    <TextInput
        className='sm:col-span-2'
        type='text'
        label='ZIP / Postal code'
        name={fieldMapping.postalCode}
        required
        defaultValue={defaultValue}
    />
);

export const groupFromFormData = (formData: FormData) => {
    const groupName = formData.get(fieldMapping.groupName) as string;
    const institution = formData.get(fieldMapping.institution) as string;
    const contactEmail = formData.get(fieldMapping.contactEmail) as string;
    const country = formData.get(fieldMapping.country) as string;
    const line1 = formData.get(fieldMapping.line1) as string;
    const line2 = formData.get(fieldMapping.line2) as string;
    const city = formData.get(fieldMapping.city) as string;
    const state = formData.get(fieldMapping.state) as string;
    const postalCode = formData.get(fieldMapping.postalCode) as string;

    return {
        groupName,
        institution,
        contactEmail,
        address: { line1, line2, city, postalCode, state, country },
    } as NewGroup;
};
