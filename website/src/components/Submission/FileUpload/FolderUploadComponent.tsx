import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import LucideFolderUp from '~icons/lucide/folder-up';
import LucideChevronDown from '~icons/lucide/chevron-down';
import LucideChevronRight from '~icons/lucide/chevron-right';
import LucideFile from '~icons/lucide/file';
import LucideFolder from '~icons/lucide/folder';
import LucideLoader from '~icons/lucide/loader';
import useClientFlag from '../../../hooks/isClient.ts';

// File tree node type
type FileNode = {
    name: string;
    path: string;
    isDirectory: boolean;
    children: FileNode[];
    file?: File;
    size?: number;
    uploadProgress?: number; // 0-100 progress percentage
    uploadStatus?: 'pending' | 'uploading' | 'complete' | 'error';
    uploadError?: string;
};

export const FolderUploadComponent = ({
    setFiles,
    name,
    ariaLabel,
}: {
    setFiles: (files: File[] | undefined) => Promise<void> | void;
    name: string;
    ariaLabel: string;
}) => {
    const [uploadedFiles, setUploadedFiles] = useState<File[] | undefined>(undefined);
    const [fileTree, setFileTree] = useState<FileNode | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const isClient = useClientFlag();

    // S3 API endpoint for uploads
    const S3_API_ENDPOINT = '/api/s3-upload';
    
    // Upload status tracking
    const [uploadProgress, setUploadProgress] = useState<{current: number, total: number, percentage: number} | null>(null);
    const [uploadComplete, setUploadComplete] = useState(false);
    
    // Build a file tree from a flat list of files
    const buildFileTree = useCallback((files: File[]): FileNode => {
        const root: FileNode = {
            name: 'root',
            path: '/',
            isDirectory: true,
            children: []
        };

        // First pass: create directory structure
        files.forEach(file => {
            // The webkitRelativePath gives us the relative path from the root directory
            const pathParts = file.webkitRelativePath.split('/');
            const fileName = pathParts.pop() || '';
            
            let currentLevel = root;
            let currentPath = '';
            
            // Create nested directories as needed
            for (const part of pathParts) {
                if (!part) continue; // Skip empty parts
                
                currentPath += `/${part}`;
                let childDir = currentLevel.children.find(node => node.name === part && node.isDirectory);
                
                if (!childDir) {
                    childDir = {
                        name: part,
                        path: currentPath,
                        isDirectory: true,
                        children: []
                    };
                    currentLevel.children.push(childDir);
                }
                
                currentLevel = childDir;
            }
            
            // Add the file with initial upload status
            currentLevel.children.push({
                name: fileName,
                path: `${currentPath}/${fileName}`,
                isDirectory: false,
                children: [],
                file: file,
                size: file.size,
                uploadProgress: 0,
                uploadStatus: 'pending'
            });
        });

        // Auto-expand first level
        if (root.children.length === 1 && root.children[0].isDirectory) {
            setExpandedNodes(new Set([root.children[0].path]));
        }

        return root;
    }, [expandedNodes]);
    
    const uploadFilesToS3 = useCallback(async (files: File[]) => {
        if (files.length === 0) {
            return files;
        }
        
        try {
            toast.info(`Preparing to upload ${files.length} files to S3...`);
            console.log(`Uploading ${files.length} files to S3 via API endpoint`);
            
            // Reset the upload status
            setUploadProgress({ current: 0, total: files.length, percentage: 0 });
            setUploadComplete(false);
            
            // Determine the submission ID or folder name for organizing files
            const submissionId = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Upload the files one by one, maintaining folder structure
            const uploadedFiles = [];
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Preserve folder structure from webkitRelativePath
                const relativePath = file.webkitRelativePath || file.name;
                // Create a key that includes the submission ID and preserves the folder structure
                const key = `raw-reads/${submissionId}/${relativePath}`;
                
                try {
                    // Step 1: Initiate multipart upload using our API
                    const initiateResponse = await fetch(S3_API_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'initiate',
                            key,
                            contentType: file.type || 'application/octet-stream'
                        })
                    });
                    
                    if (!initiateResponse.ok) {
                        throw new Error(`Failed to initiate upload: ${initiateResponse.statusText}`);
                    }
                    
                    const { uploadId, bucket } = await initiateResponse.json();
                    
                    // Step 2: Calculate the number of parts based on file size
                    const PART_SIZE = 5 * 1024 * 1024; // 5MB chunks
                    const numParts = Math.ceil(file.size / PART_SIZE);
                    const parts = [];
                    
                    // Step 3: Upload each part using presigned URLs
                    for (let partNumber = 1; partNumber <= numParts; partNumber++) {
                        // Get presigned URL for this part
                        const urlResponse = await fetch(S3_API_ENDPOINT, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                action: 'getPresignedUrl',
                                key,
                                uploadId,
                                partNumber
                            })
                        });
                        
                        if (!urlResponse.ok) {
                            throw new Error(`Failed to get presigned URL for part ${partNumber}: ${urlResponse.statusText}`);
                        }
                        
                        const { presignedUrl } = await urlResponse.json();
                        
                        // Prepare the part data
                        const start = (partNumber - 1) * PART_SIZE;
                        const end = Math.min(file.size, partNumber * PART_SIZE);
                        const partData = file.slice(start, end);
                        
                        // Upload the part directly to S3 using the presigned URL
                        const uploadResponse = await fetch(presignedUrl, {
                            method: 'PUT',
                            body: partData
                        });
                        
                        if (!uploadResponse.ok) {
                            throw new Error(`Failed to upload part ${partNumber}: ${uploadResponse.statusText}`);
                        }
                        
                        // Get the ETag from the response headers
                        const etag = uploadResponse.headers.get('ETag');
                        if (!etag) {
                            throw new Error(`No ETag received for part ${partNumber}`);
                        }
                        
                        // Add this part to our completed parts list
                        parts.push({
                            PartNumber: partNumber,
                            ETag: etag
                        });
                        
                        // Update progress for this file
                        const percentage = Math.round((partNumber / numParts) * 100);
                        
                        // Calculate overall progress
                        const overallPercentage = Math.round(((i + percentage / 100) / files.length) * 100);
                        
                        setUploadProgress({
                            current: i + 1,
                            total: files.length,
                            percentage: overallPercentage
                        });
                    }
                    
                    // Step 4: Complete the multipart upload
                    const completeResponse = await fetch(S3_API_ENDPOINT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'complete',
                            key,
                            uploadId,
                            parts
                        })
                    });
                    
                    if (!completeResponse.ok) {
                        throw new Error(`Failed to complete upload: ${completeResponse.statusText}`);
                    }
                    
                    const { location } = await completeResponse.json();
                    
                    // Add the file to our uploaded list
                    uploadedFiles.push({
                        ...file,
                        s3Key: key,
                        s3Url: location || key
                    });
                    
                } catch (fileError) {
                    console.error(`Error uploading file ${relativePath}:`, fileError);
                    // Continue with other files even if one fails
                    toast.error(`Error uploading ${relativePath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                }
                
                // Update progress
                setUploadProgress({
                    current: i + 1,
                    total: files.length,
                    percentage: Math.round(((i + 1) / files.length) * 100)
                });
            }
            
            // Mark upload as complete
            setUploadComplete(true);
            toast.success(`Successfully uploaded ${uploadedFiles.length} files to S3!`);
            
            return files;
        } catch (error) {
            console.error('Error uploading files to S3:', error);
            toast.error(`Error uploading files: ${error instanceof Error ? error.message : String(error)}`);
            setUploadProgress(null);
            throw error;
        }
    }, []);

    // Function to find a file node in the tree by path
    const findFileNodeByPath = useCallback((root: FileNode, targetPath: string): FileNode | null => {
        if (root.path === targetPath) return root;
        
        for (const child of root.children) {
            const found = findFileNodeByPath(child, targetPath);
            if (found) return found;
        }
        
        return null;
    }, []);
    
    // Function to update a file node's progress
    const updateFileProgress = useCallback((tree: FileNode, filePath: string, progress: number, status: 'pending' | 'uploading' | 'complete' | 'error', error?: string): FileNode => {
        // Create a deep copy of the tree
        const newTree = JSON.parse(JSON.stringify(tree));
        
        // Find the file node
        const fileNode = findFileNodeByPath(newTree, filePath);
        if (fileNode) {
            fileNode.uploadProgress = progress;
            fileNode.uploadStatus = status;
            if (error) fileNode.uploadError = error;
        }
        
        return newTree;
    }, [findFileNodeByPath]);
    
    const handleFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) {
            setUploadedFiles(undefined);
            setFileTree(null);
            setUploadProgress(null);
            setUploadComplete(false);
            await setFiles(undefined);
            return;
        }
        
        try {
            // First build and display the file tree immediately
            const tree = buildFileTree(files);
            setUploadedFiles(files);
            setFileTree(tree);
            await setFiles(files);
            
            toast.info(`Processing ${files.length} files...`);
            
            // Then start uploading files to S3 in the background
            // This allows the user to see the file structure immediately
            setTimeout(async () => {
                try {
                    // Start the upload process
                    const submissionId = new Date().toISOString().replace(/[:.]/g, '-');
                    setUploadProgress({ current: 0, total: files.length, percentage: 0 });
                    
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        // Preserve folder structure from webkitRelativePath
                        const relativePath = file.webkitRelativePath || file.name;
                        // Create a key that includes the submission ID and preserves the folder structure
                        const key = `raw-reads/${submissionId}/${relativePath}`;
                        // Get the full path in our file tree
                        const filePath = '/' + relativePath;
                        
                        // Update status to uploading
                        setFileTree(prevTree => {
                            if (!prevTree) return prevTree;
                            return updateFileProgress(prevTree, filePath, 0, 'uploading');
                        });
                        
                        try {
                            // Step 1: Initiate multipart upload using our API
                            const initiateResponse = await fetch(S3_API_ENDPOINT, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    action: 'initiate',
                                    key,
                                    contentType: file.type || 'application/octet-stream'
                                })
                            });
                            
                            if (!initiateResponse.ok) {
                                throw new Error(`Failed to initiate upload: ${initiateResponse.statusText}`);
                            }
                            
                            const { uploadId } = await initiateResponse.json();
                            
                            // Step 2: Calculate the number of parts based on file size
                            const PART_SIZE = 10 * 1024 * 1024; // 10MB chunks
                            const numParts = Math.ceil(file.size / PART_SIZE);
                            const parts = [];
                            
                            // Step 3: Upload each part using presigned URLs
                            for (let partNumber = 1; partNumber <= numParts; partNumber++) {
                                // Get presigned URL for this part
                                const urlResponse = await fetch(S3_API_ENDPOINT, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        action: 'getPresignedUrl',
                                        key,
                                        uploadId,
                                        partNumber
                                    })
                                });
                                
                                if (!urlResponse.ok) {
                                    throw new Error(`Failed to get presigned URL for part ${partNumber}: ${urlResponse.statusText}`);
                                }
                                
                                const { presignedUrl } = await urlResponse.json();
                                
                                // Prepare the part data
                                const start = (partNumber - 1) * PART_SIZE;
                                const end = Math.min(file.size, partNumber * PART_SIZE);
                                const partData = file.slice(start, end);
                                
                                // Upload the part directly to S3 using the presigned URL
                                const uploadResponse = await fetch(presignedUrl, {
                                    method: 'PUT',
                                    body: partData
                                });
                                
                                if (!uploadResponse.ok) {
                                    throw new Error(`Failed to upload part ${partNumber}: ${uploadResponse.statusText}`);
                                }
                                
                                // Get the ETag from the response headers
                                const etag = uploadResponse.headers.get('ETag');
                                if (!etag) {
                                    throw new Error(`No ETag received for part ${partNumber}`);
                                }
                                
                                // Add this part to our completed parts list
                                parts.push({
                                    PartNumber: partNumber,
                                    ETag: etag
                                });
                                
                                // Update progress for this file
                                const percentage = Math.round((partNumber / numParts) * 100);
                                
                                // Update this specific file's progress in the tree
                                setFileTree(prevTree => {
                                    if (!prevTree) return prevTree;
                                    return updateFileProgress(prevTree, filePath, percentage, 'uploading');
                                });
                                
                                // Calculate overall progress
                                const overallPercentage = Math.round(((i + percentage / 100) / files.length) * 100);
                                
                                setUploadProgress({
                                    current: i + 1,
                                    total: files.length,
                                    percentage: overallPercentage
                                });
                            }
                            
                            // Step 4: Complete the multipart upload
                            const completeResponse = await fetch(S3_API_ENDPOINT, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    action: 'complete',
                                    key,
                                    uploadId,
                                    parts
                                })
                            });
                            
                            if (!completeResponse.ok) {
                                throw new Error(`Failed to complete upload: ${completeResponse.statusText}`);
                            };
                            
                            // Update status to complete
                            setFileTree(prevTree => {
                                if (!prevTree) return prevTree;
                                return updateFileProgress(prevTree, filePath, 100, 'complete');
                            });
                            
                            // Update overall progress
                            setUploadProgress({
                                current: i + 1,
                                total: files.length,
                                percentage: Math.round(((i + 1) / files.length) * 100)
                            });
                        } catch (error) {
                            console.error(`Error uploading file ${relativePath}:`, error);
                            
                            // Update status to error
                            setFileTree(prevTree => {
                                if (!prevTree) return prevTree;
                                return updateFileProgress(
                                    prevTree, 
                                    filePath, 
                                    0, 
                                    'error', 
                                    error instanceof Error ? error.message : String(error)
                                );
                            });
                            
                            // Continue with other files even if one fails
                        }
                    }
                    
                    // Mark upload as complete
                    setUploadComplete(true);
                    toast.success(`Successfully uploaded files to S3!`);
                } catch (error) {
                    console.error('Error uploading files to S3:', error);
                    toast.error(`Error uploading files: ${error instanceof Error ? error.message : String(error)}`);
                    setUploadProgress(null);
                }
            }, 100); // Small delay to ensure UI is responsive first
            
        } catch (error) {
            toast.error(`Failed to process files: ${error instanceof Error ? error.message : String(error)}`, {
                autoClose: false,
            });
            setUploadedFiles(undefined);
            setFileTree(null);
            setUploadProgress(null);
            setUploadComplete(false);
            await setFiles(undefined);
        }
    }, [setFiles, buildFileTree, updateFileProgress]);

    // Drag and drop functionality removed as it doesn't work reliably for folder structures

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            void handleFiles(filesArray);
        }
    };
    
    const toggleNode = (nodePath: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodePath)) {
                newSet.delete(nodePath);
            } else {
                newSet.add(nodePath);
            }
            return newSet;
        });
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Render a file node
    const renderFileNode = (node: FileNode, level: number = 0): JSX.Element => {
        const isExpanded = expandedNodes.has(node.path);
        
        // Determine status color for file upload
        const getStatusColor = (status?: string, progress?: number) => {
            if (!status || status === 'pending') return 'bg-gray-200';
            if (status === 'uploading') return 'bg-blue-500';
            if (status === 'complete') return 'bg-green-500';
            if (status === 'error') return 'bg-red-500';
            return 'bg-gray-200';
        };
        
        // Determine status icon for file upload
        const getStatusIcon = (status?: string) => {
            if (status === 'uploading') return <LucideLoader className="animate-spin h-3 w-3 text-blue-500" />;
            if (status === 'complete') return <span className="text-green-500 text-xs">✓</span>;
            if (status === 'error') return <span className="text-red-500 text-xs">✗</span>;
            return null;
        };
        
        return (
            <div key={node.path} className="text-left">
                <div 
                    className={`flex items-center ${node.isDirectory ? 'cursor-pointer hover:bg-gray-100' : ''} px-1 rounded`}
                    style={{ paddingLeft: `${level * 12}px` }}
                    onClick={() => node.isDirectory && toggleNode(node.path)}
                >
                    {node.isDirectory ? (
                        <>
                            {isExpanded ? 
                                <LucideChevronDown className="h-3.5 w-3.5 text-gray-500" /> : 
                                <LucideChevronRight className="h-3.5 w-3.5 text-gray-500" />
                            }
                            <LucideFolder className="h-4 w-4 text-blue-500 ml-1 mr-1" />
                            <span className="text-xs text-gray-700">{node.name}</span>
                            <span className="text-xs text-gray-400 ml-2">
                                ({node.children.length} item{node.children.length !== 1 ? 's' : ''})
                            </span>
                        </>
                    ) : (
                        <>
                            <div className="w-3.5" /> {/* Spacer to align with folders */}
                            <LucideFile className="h-4 w-4 text-gray-500 ml-1 mr-1" />
                            <div className="flex-1 min-w-0 flex items-center">
                                <span className="text-xs text-gray-700 truncate max-w-[140px]">{node.name}</span>
                                {node.size !== undefined && (
                                    <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">({formatFileSize(node.size)})</span>
                                )}
                            </div>
                            
                            {/* Status icon */}
                            <div className="ml-2 w-5 flex justify-center">
                                {getStatusIcon(node.uploadStatus)}
                            </div>
                            
                            {/* Progress information */}
                            <div className="ml-2 flex-shrink-0">
                                {node.uploadStatus && (
                                    <div className="flex items-center">
                                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full ${getStatusColor(node.uploadStatus, node.uploadProgress)} transition-all duration-300 ease-in-out`} 
                                                style={{ width: `${node.uploadProgress || 0}%` }}
                                            ></div>
                                        </div>
                                        <span className="text-xs text-gray-500 ml-1 w-8 text-right">{node.uploadProgress || 0}%</span>
                                    </div>
                                )}
                                
                                {/* Error message if there is one */}
                                {node.uploadStatus === 'error' && node.uploadError && (
                                    <div className="text-xs text-red-500 mt-1 truncate max-w-[150px]" title={node.uploadError}>
                                        {node.uploadError}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                
                {node.isDirectory && isExpanded && (
                    <div>
                        {node.children
                            .sort((a, b) => {
                                // Directories first, then alphabetical
                                if (a.isDirectory && !b.isDirectory) return -1;
                                if (!a.isDirectory && b.isDirectory) return 1;
                                return a.name.localeCompare(b.name);
                            })
                            .map(child => renderFileNode(child, level + 1))
                        }
                    </div>
                )}
            </div>
        );
    };

    // Stats for the file tree
    const getTreeStats = (tree: FileNode): { totalFiles: number, totalSize: number } => {
        if (!tree) return { totalFiles: 0, totalSize: 0 };
        
        let totalFiles = 0;
        let totalSize = 0;
        
        const countFiles = (node: FileNode) => {
            if (!node.isDirectory) {
                totalFiles++;
                totalSize += node.size || 0;
            } else {
                node.children.forEach(countFiles);
            }
        };
        
        tree.children.forEach(countFiles);
        return { totalFiles, totalSize };
    };

    return (
        <div
            className={`flex flex-col ${fileTree ? 'h-auto min-h-[16rem]' : 'h-52'} w-full rounded-lg border ${fileTree ? 'border-hidden' : (isDragging ? 'border-dashed border-yellow-400 bg-yellow-50' : 'border-dashed border-gray-900/25')}`}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                toast.info("Sorry, drag and drop is not currently supported but you can select an entire folder to upload by clicking the Upload Folder button.");
            }}
        >
            {!fileTree ? (
                <div className="flex flex-col items-center justify-center flex-1 py-2 px-4">
                    <LucideFolderUp className={`mx-auto mt-4 mb-2 h-12 w-12 ${isDragging ? 'text-yellow-400' : 'text-gray-300'}`} aria-hidden="true" />
                    <div>
                        <label className="inline relative cursor-pointer rounded-md bg-white font-semibold text-primary-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-2 hover:text-primary-500">
                            <span
                                onClick={(e) => {
                                    e.preventDefault();
                                    document.getElementById(name)?.click();
                                }}
                            >
                                Upload Folder
                            </span>
                            {isClient && (
                                <input
                                    id={name}
                                    name={name}
                                    type="file"
                                    className="sr-only"
                                    aria-label={ariaLabel}
                                    data-testid={name}
                                    onChange={handleFolderSelect}
                                    /* The webkitdirectory attribute enables folder selection */
                                    {...{ webkitdirectory: "", directory: "" }}
                                    multiple
                                />
                            )}
                        </label>
                    </div>
                    <p className="text-sm pt-2 leading-5 text-gray-600">
                        Upload an entire folder of raw read files
                    </p>
                    {isDragging && (
                        <p className="text-sm mt-2 py-1 px-2 bg-yellow-100 text-yellow-800 rounded-md">
                            Please use the Upload Folder button instead of drag and drop
                        </p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col text-left px-4 py-3">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h3 className="text-sm font-medium">Folder Structure</h3>
                            {uploadedFiles && (
                                <p className="text-xs text-gray-500">
                                    {getTreeStats(fileTree).totalFiles} files ({formatFileSize(getTreeStats(fileTree).totalSize)})
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => void handleFiles([])}
                            data-testid={`discard_${name}`}
                            className="text-xs break-words text-gray-700 py-1.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50"
                            disabled={uploadProgress && !uploadComplete}
                        >
                            Discard files
                        </button>
                    </div>
                    
                    {uploadProgress && !uploadComplete && (
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center">
                                    <LucideLoader className="animate-spin h-4 w-4 mr-2 text-primary-500" />
                                    <span className="text-xs font-medium text-gray-700">
                                        Uploading to S3... ({uploadProgress.current}/{uploadProgress.total})
                                    </span>
                                </div>
                                <span className="text-xs text-gray-600">{uploadProgress.percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-primary-500 h-2 rounded-full transition-all duration-300 ease-in-out" 
                                    style={{ width: `${uploadProgress.percentage}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    {uploadComplete && (
                        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                            All files have been successfully uploaded to S3 storage
                        </div>
                    )}
                    
                    <div className="border rounded bg-gray-50 p-2 max-h-64 overflow-auto">
                        {fileTree.children.length > 0 ? (
                            fileTree.children
                                .sort((a, b) => {
                                    // Directories first, then alphabetical
                                    if (a.isDirectory && !b.isDirectory) return -1;
                                    if (!a.isDirectory && b.isDirectory) return 1;
                                    return a.name.localeCompare(b.name);
                                })
                                .map(node => renderFileNode(node))
                        ) : (
                            <p className="text-xs text-gray-500 text-center py-2">No files found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};