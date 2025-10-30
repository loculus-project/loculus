import { type FC } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { Button } from '../common/Button';

type FilesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dataToView: SequenceEntryToEdit | undefined;
};

export const FilesDialog: FC<FilesDialogProps> = ({ isOpen, onClose, dataToView }) => {
    if (!isOpen || !dataToView) return null;

    return (
        <div className='fixed inset-0 flex items-center justify-center z-50 overflow-auto bg-black bg-opacity-30'>
            <div className='bg-white rounded-lg p-6 max-w-xl mx-3 w-full max-h-[90vh] flex flex-col'>
                <div className='flex justify-between items-center mb-4'>
                    <h2 className='text-xl font-semibold'>Files</h2>
                    <Button className='text-gray-500 hover:text-gray-700' onClick={onClose}>
                        ✕
                    </Button>
                </div>

                <div>
                    {Object.entries(dataToView.processedData.files ?? {}).map(([category, files]) => (
                        <div key={category} className='mb-4'>
                            <h3 className='font-medium'>{category}</h3>
                            <ul className='list-disc pl-5 space-y-1'>
                                {files.map((file) => (
                                    <li key={file.fileId}>
                                        <a
                                            href={`/seq/${dataToView.accession}.${dataToView.version}/${category}/${file.name}`}
                                            className='text-primary-600 hover:underline'
                                        >
                                            {file.name}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
