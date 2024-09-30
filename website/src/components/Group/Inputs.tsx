import { type ComponentProps, type FC, type FormEvent, type PropsWithChildren, useState } from 'react';

import { listOfCountries } from './listOfCountries.ts';

const chooseCountry = 'Choose a country...';

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
    defaultValue?: string;
};

const TextInput: FC<TextInputProps> = ({ className, label, name, fieldMappingKey, type, defaultValue }) => (
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
        name='group-name'
        fieldMappingKey='groupName'
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
        name='institution-name'
        fieldMappingKey='institution'
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
        name='email'
        fieldMappingKey='contactEmail'
        defaultValue={defaultValue}
    />
);

type CountryInputProps = {
    defaultValue?: string;
};

export const CountryInput: FC<CountryInputProps> = ({ defaultValue }) => (
    <LabelledInputContainer label='Country' htmlFor='country' className='sm:col-span-3' required>
        <select
            id={fieldMapping.country.id}
            name='country'
            required={fieldMapping.country.required}
            autoComplete='country-name'
            className='block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:max-w-xs sm:text-sm sm:leading-6'
            defaultValue={defaultValue}
        >
            <option>{chooseCountry}</option>
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
        name='address-line-1'
        fieldMappingKey='line1'
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
        name='address-line-2'
        fieldMappingKey='line2'
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
        name='city'
        fieldMappingKey='city'
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
        name='state'
        fieldMappingKey='state'
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
        name='postal-code'
        fieldMappingKey='postalCode'
        defaultValue={defaultValue}
    />
);
