import Papa from 'papaparse';
import { type FC, type ReactNode, useState } from 'react';
import { confirmAlert } from 'react-confirm-alert';

import { CompressedFile, RawFile, splitFileExtensions } from './FileUpload/fileProcessing';
import { Button } from '../common/Button';
import { ModalBox } from '../common/ModalBox';

const MAX_DISPLAYED_AUTHOR_LISTS = 10;

export type ParsedAuthor = {
    lastName: string;
    firstName: string;
};

export type AuthorListOccurrence = {
    authors: string;
    numberOfEntries: number;
};

/**
 * Splits an authors string in the Loculus format (`Last, First; Last, First`) into last and first names,
 * mirroring how preprocessing interprets it.
 */
export const parseAuthors = (authors: string): ParsedAuthor[] =>
    authors
        .split(';')
        .map((author) => author.trim())
        .filter((author) => author !== '')
        .map((author) => {
            const [lastName, firstName = ''] = author.split(',');
            return {
                lastName: lastName.trim().replace(/\s+/g, ' '),
                firstName: firstName.trim().replace(/\s+/g, ' '),
            };
        });

/**
 * Reads the distinct, non-empty author lists from the given columns of a metadata TSV,
 * together with the number of entries that use each list.
 */
export const extractAuthorLists = async (
    metadataFile: File,
    authorsFields: string[],
): Promise<AuthorListOccurrence[]> => {
    if (authorsFields.length === 0) return [];

    const processedFile =
        splitFileExtensions(metadataFile).compressionExtension !== null
            ? new CompressedFile(metadataFile)
            : new RawFile(metadataFile);

    let text: string;
    try {
        text = await processedFile.text();
    } catch {
        return [];
    }

    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    if (parsed.data.length === 0) return [];

    const [header, ...rows] = parsed.data;
    const authorColumnIndices = header
        .map((column, index) => (authorsFields.includes(column.trim()) ? index : -1))
        .filter((index) => index !== -1);

    const occurrences = new Map<string, number>();
    for (const row of rows) {
        for (const index of authorColumnIndices) {
            const authors = row[index]?.trim() ?? '';
            if (authors === '') continue;
            occurrences.set(authors, (occurrences.get(authors) ?? 0) + 1);
        }
    }

    return Array.from(occurrences, ([authors, numberOfEntries]) => ({ authors, numberOfEntries }));
};

const AuthorNamesTable: FC<{ authorLists: AuthorListOccurrence[] }> = ({ authorLists }) => {
    const displayedAuthorLists = authorLists.slice(0, MAX_DISPLAYED_AUTHOR_LISTS);
    const numberOfHiddenAuthorLists = authorLists.length - displayedAuthorLists.length;

    return (
        <div className='mt-4 space-y-4'>
            {displayedAuthorLists.map(({ authors, numberOfEntries }, listIndex) => (
                <div key={authors}>
                    {authorLists.length > 1 && (
                        <p className='text-xs text-gray-500 mb-1'>
                            Author list {listIndex + 1} (used by {numberOfEntries}{' '}
                            {numberOfEntries === 1 ? 'entry' : 'entries'})
                        </p>
                    )}
                    <table className='w-full table-fixed text-sm border border-gray-200'>
                        <thead className='bg-gray-50 text-left'>
                            <tr>
                                <th className='px-2 py-1 font-medium'>Last name</th>
                                <th className='px-2 py-1 font-medium'>First name</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parseAuthors(authors).map((author, authorIndex) => (
                                <tr key={authorIndex} className='border-t border-gray-200'>
                                    <td className='px-2 py-1'>{author.lastName}</td>
                                    <td className='px-2 py-1'>
                                        {author.firstName !== '' ? (
                                            author.firstName
                                        ) : (
                                            <span className='italic text-yellow-700'>none</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            {numberOfHiddenAuthorLists > 0 && (
                <p className='text-xs text-gray-500'>
                    … and {numberOfHiddenAuthorLists} more author {numberOfHiddenAuthorLists === 1 ? 'list' : 'lists'}.
                </p>
            )}
        </div>
    );
};

export type SubmissionConfirmationStep =
    { type: 'openDataUseTerms' } | { type: 'authorNames'; authorLists: AuthorListOccurrence[] };

type SubmissionConfirmationWizardProps = {
    steps: SubmissionConfirmationStep[];
    onConfirmation: () => void;
    onClose: () => void;
};

/**
 * Walks the user through the confirmations needed before submitting, one step at a time.
 * Confirming the last step calls `onConfirmation`.
 */
export const SubmissionConfirmationWizard: FC<SubmissionConfirmationWizardProps> = ({
    steps,
    onConfirmation,
    onClose,
}) => {
    const [stepIndex, setStepIndex] = useState(0);
    const step = steps[stepIndex];
    const isFirstStep = stepIndex === 0;

    const next = () => {
        if (stepIndex === steps.length - 1) {
            onConfirmation();
        } else {
            setStepIndex(stepIndex + 1);
        }
    };

    let content: ReactNode;
    let confirmButtonText: string;
    let closeButtonText: string;
    switch (step.type) {
        case 'openDataUseTerms':
            content = (
                <h3 className='font-bold text-lg pr-8'>
                    You have selected the Open Data Use Terms. Once released under the Open Data Use Terms sequences
                    will be deposited to INSDC and cannot be changed to the Restricted-Use Data Use Terms.
                </h3>
            );
            confirmButtonText = 'Continue under Open terms';
            closeButtonText = 'Cancel';
            break;
        case 'authorNames':
            content = (
                <>
                    <h3 className='font-bold text-lg pr-8'>Are first and last names assigned correctly?</h3>
                    <p className='text-sm text-gray-600 mt-2'>
                        Authors must be given as <i>last name, first name</i>, separated by semicolons (e.g.{' '}
                        <code>Smith, Anna; Perez, Tom J.</code>). Please check that the names below have been split
                        correctly.
                    </p>
                    <AuthorNamesTable authorLists={step.authorLists} />
                </>
            );
            confirmButtonText = 'Names are correct';
            closeButtonText = 'Go back and edit';
            break;
    }

    return (
        <ModalBox>
            <form method='dialog'>
                <Button circle size='sm' variant='ghost' className='absolute right-2 top-2' onClick={onClose}>
                    ✕
                </Button>
            </form>
            {steps.length > 1 && (
                <p className='text-xs font-medium text-gray-500 mb-2'>
                    Step {stepIndex + 1} of {steps.length}
                </p>
            )}
            {content}
            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <Button variant='primary' onClick={isFirstStep ? onClose : () => setStepIndex(stepIndex - 1)}>
                        {isFirstStep ? closeButtonText : 'Back'}
                    </Button>
                </form>
                <form method='dialog'>
                    <Button variant='primary' onClick={next}>
                        {confirmButtonText}
                    </Button>
                </form>
            </div>
        </ModalBox>
    );
};

export const displaySubmissionConfirmationWizard = ({
    steps,
    onConfirmation,
}: {
    steps: SubmissionConfirmationStep[];
    onConfirmation: () => void;
}) => {
    confirmAlert({
        closeOnClickOutside: true,
        customUI: ({ onClose }) => (
            <SubmissionConfirmationWizard
                steps={steps}
                onConfirmation={() => {
                    onClose();
                    onConfirmation();
                }}
                onClose={onClose}
            />
        ),
    });
};
