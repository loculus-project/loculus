import { type FC } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { BaseDialog } from '../common/BaseDialog.tsx';

type FilesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dataToView: SequenceEntryToEdit | undefined;
};

export const FilesDialog: FC<FilesDialogProps> = ({ isOpen, onClose, dataToView }) => {
    if (!dataToView) return null;

    return (
        <BaseDialog title='Files' isOpen={isOpen} onClose={onClose} fullWidth={false}>
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
        </BaseDialog>
    );
};
