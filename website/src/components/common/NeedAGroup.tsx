import { routes } from '../../routes/routes';
import DashiconsGroups from '~icons/dashicons/groups';

export const NeedAGroup = () => (
    <div className='mt-6 message max-w-4xl mx-auto'>
        <DashiconsGroups className='w-12 h-12 inline-block mr-2' />
        <div>
            <p>
                Sequences can only be submitted to the database by users who are part of a <i>group</i>.
            </p>
            <p className='mt-3'>
                To submit to the database, please either{' '}
                <a href={routes.createGroup()} className='underline'>
                    create a submitting group
                </a>{' '}
                (a submitting group with one member is not a problem!) or ask a submitting group administrator to add you to an existing
                group.
            </p>
        </div>
    </div>
);
