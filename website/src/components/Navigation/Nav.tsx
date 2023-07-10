import { useState } from 'react';

import { SandwichMenu } from './SandwichMenu';

export const Nav = () => {
    const [SandwichOpen, setSandwichOpen] = useState(false);

    const toggleSandwich = () => {
        setSandwichOpen(!SandwichOpen);
    };

    return (
        <div className='flex justify-end'>
            <div className='subtitle hidden sm:flex sm:z-6'>
                <div className='navigation'>
                    <div>
                        <a href='/search'> Search </a>
                    </div>
                </div>
            </div>

            <div className='sm:hidden fixed z-0'>
                <SandwichMenu />
            </div>
        </div>
    );
};
