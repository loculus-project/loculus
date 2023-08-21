import { SandwichMenu } from './SandwichMenu';

export const Navigation = () => {
    return (
        <div className='flex justify-end'>
            <div className='subtitle hidden sm:flex sm:z-6 gap-4'>
                <a href='/search'>Search</a>
                <a href='/submit'>Submit</a>
                <a href='/user'>User</a>
            </div>

            <div className='sm:hidden fixed z-0'>
                <SandwichMenu top={16} right={28} />
            </div>
        </div>
    );
};
