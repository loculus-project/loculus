import type { FC } from 'react';

const styledHamburger = `
    .hamburger {
        width: 2rem;
        height: 2rem;
        display: flex;
        justify-content: space-around;
        flex-flow: column nowrap;
        z-index: 1001;
    }
    
    .burger {                     
        width: 2rem;
        height: 0.25rem;
        border-radius: 10px;
        transform-origin: 1px;
        transition: all 0.3s linear;
    }
    
    .burger1--open {
        transform: rotate(45deg);
    }
    
    .burger1--closed {
        transform: rotate(0);
    }
    
    .burger2--open {
      opacity: 0;
    }
    
    .burger2--closed {
      opacity: 1;
    }
      
    .burger3--open {
      transform: rotate(-45deg);
    }
    
    .burger3--closed {
      transform: rotate(0);
    }
`;

export const SandwichIcon: FC<{ isOpen: boolean }> = ({ isOpen }) => {
    return (
        <div className='relative' aria-label='main menu'>
            <div className='hamburger'>
                <div className={`burger bg-primary-600 burger1--${isOpen ? 'open' : 'closed'}`} />
                <div className={`burger bg-primary-600 burger2--${isOpen ? 'open' : 'closed'}`} />
                <div className={`burger bg-primary-600  burger3--${isOpen ? 'open' : 'closed'}`} />
            </div>
            <style>{styledHamburger}</style>
        </div>
    );
};
