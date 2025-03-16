import { useState } from 'react';
import { FolderUploadComponent } from './FileUpload/FolderUploadComponent';

type RawReadsFormProps = {
    submissionId: string;
};

export const RawReadsForm = ({ submissionId }: RawReadsFormProps) => {
    const [rawReadFiles, setRawReadFiles] = useState<File[] | undefined>(undefined);

    const handleSetFiles = async (files: File[] | undefined) => {
        setRawReadFiles(files);
    };

    return (
        <div>
            <h3 className="text-lg font-medium mb-2">Raw Reads</h3>
            <p className="text-sm text-gray-600 mb-4">
                Upload a folder containing raw read files. All files in the folder will be uploaded.
            </p>
            <FolderUploadComponent
                setFiles={handleSetFiles}
                name={`raw-reads-upload-${submissionId}`}
                ariaLabel="Upload raw read files"
            />
            {rawReadFiles && rawReadFiles.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                    <h4 className="text-sm font-medium mb-1">Upload Summary</h4>
                    <p className="text-xs text-gray-600">
                        {rawReadFiles.length} files will be uploaded as part of this submission.
                    </p>
                </div>
            )}
        </div>
    );
};