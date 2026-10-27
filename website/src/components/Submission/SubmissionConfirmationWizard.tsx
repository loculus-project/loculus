import { type FC, type ReactNode, useState } from 'react';
import { confirmAlert } from 'react-confirm-alert';

import { type AuthorListOccurrence, parseAuthors } from './authorNames';
import { Button } from '../common/Button';
import { ModalBox } from '../common/ModalBox';

const AuthorNamesTable: FC<{ authorLists: AuthorListOccurrence[] }> = ({ authorLists }) => {
    return (
        <div className='mt-4 space-y-4'>
            {authorLists.map(({ authors, numberOfEntries }, listIndex) => (
                <div key={authors}>
                    {authorLists.length > 1 && (
                        <p className='text-xs text-gray-600 mb-1'>
                            Author list {listIndex + 1} (used by {numberOfEntries}{' '}
                            {numberOfEntries === 1 ? 'entry' : 'entries'})
                        </p>
                    )}
                    <table className='w-full table-fixed text-sm border border-gray-200'>
                        <thead className='bg-gray-50 text-left'>
                            <tr>
                                <th className='px-2 py-1 font-medium'>First name</th>
                                <th className='px-2 py-1 font-medium'>Last name</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parseAuthors(authors).map((author, authorIndex) => (
                                <tr key={authorIndex} className='border-t border-gray-200'>
                                    {author.status === 'ok' ? (
                                        <>
                                            <td className='px-2 py-1'>
                                                {author.firstName !== '' ? (
                                                    author.firstName
                                                ) : (
                                                    <span className='italic text-gray-500'>none</span>
                                                )}
                                            </td>
                                            <td className='px-2 py-1'>{author.lastName}</td>
                                        </>
                                    ) : (
                                        <td colSpan={2} className='px-2 py-1 text-red-700'>
                                            {author.raw}
                                            <span className='italic'>
                                                {' '}
                                                (
                                                {author.status === 'missingComma' ? 'missing comma' : 'too many commas'}
                                                : this author will be rejected)
                                            </span>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export type SubmissionConfirmationStep =
    { type: 'openDataUseTerms' } | { type: 'authorNames'; authorLists: AuthorListOccurrence[] } | { type: 'nextSteps' };

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
                <>
                    <h3 className='font-bold text-lg pr-8'>Open data use terms</h3>
                    <p className='text-sm text-gray-800 mt-2'>
                        You have selected the Open Data Use Terms. Once released under the Open Data Use Terms,
                        sequences will be deposited to INSDC and cannot be changed to the Restricted-Use Data Use Terms.
                    </p>
                </>
            );
            confirmButtonText = 'Continue under Open terms';
            closeButtonText = 'Cancel';
            break;
        case 'authorNames':
            content = (
                <>
                    <h3 className='font-bold text-lg pr-8'>Are first and last names assigned correctly?</h3>
                    <p className='text-sm text-gray-800 mt-2'>
                        In your submission, authors must be given as <i>last name, first name</i>, separated by
                        semicolons (e.g. <code>Smith, Anna; Perez, Tom J.</code>). Please check that the names below
                        have been split correctly. If not, please go back and change your metadata input.
                    </p>
                    <AuthorNamesTable authorLists={step.authorLists} />
                </>
            );
            confirmButtonText = 'Names are correct';
            closeButtonText = 'Go back and edit';
            break;
        case 'nextSteps':
            content = (
                <>
                    <h3 className='font-bold text-lg pr-8'>What happens next</h3>
                    <p className='text-sm text-gray-800 mt-2'>
                        When you click Submit your sequences will enter processing. On the next page you will be able to
                        review and <i>release</i> the processed sequences.
                    </p>
                    <p className='text-sm text-gray-800 mt-2'>
                        <i>The sequences will not be released until you review and release them.</i>
                    </p>
                </>
            );
            confirmButtonText = 'Submit';
            closeButtonText = 'Cancel';
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
                <p className='text-xs font-medium text-gray-600 mb-2'>
                    Step {stepIndex + 1} of {steps.length}
                </p>
            )}
            {content}
            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <Button variant='outline' onClick={isFirstStep ? onClose : () => setStepIndex(stepIndex - 1)}>
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
