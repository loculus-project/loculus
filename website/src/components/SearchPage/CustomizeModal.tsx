import React, { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, Disclosure } from '@headlessui/react';
import ChevronUpIcon from '~icons/lucide/chevron-up';

const titleCaseWords = (str: string) => {
    return str
        .split(' ')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');
};

interface CheckboxFieldProps {
    label: string;
    checked: boolean;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({ label, checked, onChange, disabled }) => (
    <div className='mb-2'>
        <label className='flex items-center cursor-pointer'>
            <input
                type='checkbox'
                checked={checked}
                onChange={onChange}
                className={`form-checkbox h-5 w-5 ${disabled !== true ? 'text-blue-600' : 'text-gray-300'}`}
                disabled={disabled}
            />
            <span className='ml-2 text-gray-700'>{label}</span>
        </label>
    </div>
);

interface CustomizeModalProps {
    isCustomizeModalOpen: boolean;
    toggleCustomizeModal: () => void;
    alwaysPresentFieldNames: string[];
    visibilities: Map<string, boolean>;
    setAVisibility: (fieldName: string, isVisible: boolean) => void;
    nameToLabelMap: Record<string, string>;
    nameToHeaderMap: Record<string, string>;
    thingToCustomize: string;
}

export const CustomizeModal: React.FC<CustomizeModalProps> = ({
    isCustomizeModalOpen,
    toggleCustomizeModal,
    alwaysPresentFieldNames,
    visibilities,
    setAVisibility,
    nameToLabelMap,
    nameToHeaderMap,
    thingToCustomize,
}) => {
    console.log('nametoheadermap', nameToHeaderMap);
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());

    const toggleSection = (header: string) => {
        setOpenSections((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(header)) {
                newSet.delete(header);
            } else {
                newSet.add(header);
            }
            return newSet;
        });
    };

    const groupedFields = Object.entries(nameToHeaderMap).reduce((acc, [fieldName, header]) => {
        if (!acc[header]) {
            acc[header] = [];
        }
        acc[header].push(fieldName);
        return acc;
    }, {} as Record<string, string[]>);

    return (
        <Transition appear show={isCustomizeModalOpen}>
            <Dialog as='div' className='fixed inset-0 z-50 overflow-y-auto' onClose={toggleCustomizeModal}>
                <div className='min-h-screen px-4 text-center'>
                    <div className='fixed inset-0 bg-black opacity-30' />

                    <span className='inline-block h-screen align-middle' aria-hidden='true'>
                        &#8203;
                    </span>

                    <DialogPanel className='inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl text-sm'>
                        <DialogTitle as='h3' className='text-lg font-medium leading-6 text-gray-900'>
                            Customize {titleCaseWords(thingToCustomize)}s
                        </DialogTitle>

                        <div className='mt-4 text-gray-700 text-sm'>Toggle the visibility of {thingToCustomize}s</div>

                        <div className='mt-4'>
                            {alwaysPresentFieldNames.map((fieldName) => (
                                <CheckboxField key={fieldName} label={fieldName} checked disabled />
                            ))}

                            {Object.entries(groupedFields).map(([header, fields]) => (
                                <Disclosure key={header}>
                                    {({ open }) => (
                                        <>
                                            <Disclosure.Button 
                                                className='flex justify-between w-full px-2 py-2 text-sm font-medium text-left 
                                                mb-1 mt-1 text-black-900 bg-gray-50 rounded-lg hover:bg-blue-100 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75'
                                                onClick={() => toggleSection(header)}
                                            >
                                                <span>{header}</span>
                                                <ChevronUpIcon
                                                    className={`${
                                                        open ? 'transform rotate-180' : ''
                                                    } w-5 h-5 text-gray-500`}
                                                />
                                            </Disclosure.Button>
                                            <Disclosure.Panel className='px-4 pt-4 pb-2 text-sm text-gray-500'>
                                                {fields.map((fieldName) => (
                                                    <CheckboxField
                                                        key={fieldName}
                                                        label={nameToLabelMap[fieldName]}
                                                        checked={visibilities.get(fieldName) || false}
                                                        onChange={(e) => {
                                                            setAVisibility(fieldName, e.target.checked);
                                                        }}
                                                    />
                                                ))}
                                            </Disclosure.Panel>
                                        </>
                                    )}
                                </Disclosure>
                            ))}
                        </div>

                        <div className='mt-6'>
                            <button
                                type='button'
                                className='inline-flex justify-center px-4 py-2 text-sm font-medium text-blue-900 bg-blue-100 border border-transparent rounded-md hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500'
                                onClick={toggleCustomizeModal}
                            >
                                Close
                            </button>
                        </div>
                    </DialogPanel>
                </div>
            </Dialog>
        </Transition>
    );
};