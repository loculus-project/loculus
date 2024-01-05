import { type FC, useEffect, useState } from 'react';

type Props = {
    count: number;
    description: string;
    localStorageKey: string;
    children: React.ReactNode;
};
export const SequenceStatusBox: FC<Props> = ({ count, description, localStorageKey, children }) => {
    const [isChecked, setIsChecked] = useState(localStorage.getItem(localStorageKey) === 'true');

    useEffect(() => {
        localStorage.setItem(localStorageKey, isChecked ? 'true' : 'false');
    }, [localStorageKey, isChecked]);

    const handleCheckboxChange = () => {
        setIsChecked((prevChecked) => {
            const newChecked = !prevChecked;
            localStorage.setItem(localStorageKey, newChecked ? 'true' : 'false');
            return newChecked;
        });
    };

    return (
        <div className='collapse bg-base-200'>
            <input type='checkbox' checked={isChecked} onChange={handleCheckboxChange} data-testid={localStorageKey} />
            <div className='collapse-title text-xl font-medium'>
                {count} sequence{count === 1 ? '' : 's'} {description}
            </div>
            <div className='collapse-content'>{children}</div>
        </div>
    );
};
