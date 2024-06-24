import { Dialog, Transition } from '@headlessui/react';

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
    thingToCustomize: string;
}

export const CustomizeModal: React.FC<CustomizeModalProps> = ({
    isCustomizeModalOpen,
    toggleCustomizeModal,
    alwaysPresentFieldNames,
    visibilities,
    setAVisibility,
    nameToLabelMap,
    thingToCustomize,
}) => {
    return (
        <Transition appear show={isCustomizeModalOpen}>
            <Dialog as='div' className='fixed inset-0 z-50 overflow-y-auto' onClose={toggleCustomizeModal}>
                <div className='min-h-screen px-4 text-center'>
                    <Dialog.Overlay className='fixed inset-0 bg-black opacity-30' />

                    <span className='inline-block h-screen align-middle' aria-hidden='true'>
                        &#8203;
                    </span>

                    <div className='inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl text-sm'>
                        <Dialog.Title as='h3' className='text-lg font-medium leading-6 text-gray-900'>
                            Customize {titleCaseWords(thingToCustomize)}s
                        </Dialog.Title>

                        <div className='mt-4 text-gray-700 text-sm'>Toggle the visibility of {thingToCustomize}s</div>

                        <div className='mt-4'>
                            {alwaysPresentFieldNames.map((fieldName) => (
                                <CheckboxField key={fieldName} label={fieldName} checked disabled />
                            ))}

                            {Array.from(visibilities).map(([fieldName, visible]) => (
                                <CheckboxField
                                    key={fieldName}
                                    label={nameToLabelMap[fieldName]}
                                    checked={visible}
                                    onChange={(e) => {
                                        setAVisibility(fieldName, e.target.checked);
                                    }}
                                />
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
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
