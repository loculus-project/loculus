import { routes } from '../../routes/routes';
import DashiconsGroups from '~icons/dashicons/groups';

interface NeedAGroupProps {
    continueSubmissionOrganism?: string;
}

export const NeedAGroup = ({ continueSubmissionOrganism }: NeedAGroupProps) => {
    const href = continueSubmissionOrganism
        ? routes.createGroup({ organism: continueSubmissionOrganism })
        : routes.createGroup();

    return (
        <div className='mt-6 message max-w-4xl mx-auto'>
            <DashiconsGroups className='w-12 h-12 inline-block mr-2' />
            <div>
                <p>
                    Sequences can only be submitted to the database by users who are part of a <i>submitting group</i>.
                </p>
                <p className='mt-3'>
                    To submit to the database, please either{' '}
                    <a href={href} className='underline'>
                        create a submitting group
                    </a>{' '}
                    or ask a group administrator to add you to an existing group.
                </p>
            </div>
        </div>
    );
};
