import { type FC } from 'react';

type FilesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
};

const exampleFiles = [
    { name: 'Example 1', url: 'https://example.com/file1.txt' },
    { name: 'Example 2', url: 'https://example.com/file2.txt' },
    { name: 'Example 3', url: 'https://example.com/file3.txt' },
];

export const FilesDialog: FC<FilesDialogProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className='fixed inset-0 flex items-center justify-center z-50 overflow-auto bg-black bg-opacity-30'>
            <div className='bg-white rounded-lg p-6 max-w-xl mx-3 w-full max-h-[90vh] flex flex-col'>
                <div className='flex justify-between items-center mb-4'>
                    <h2 className='text-xl font-semibold'>Files</h2>
                    <button className='text-gray-500 hover:text-gray-700' onClick={onClose}>
                        ✕
                    </button>
                </div>

                <ul className='list-disc pl-5 space-y-2'>
                    {exampleFiles.map(({ name, url }) => (
                        <li key={url}>
                            <a href={url} className='text-blue-600 hover:underline' target='_blank' rel='noopener noreferrer'>
                                {name}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
