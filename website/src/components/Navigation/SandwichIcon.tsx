import type { FC } from 'react';

const styledHamburger = (isOpen: boolean) => `
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
        background-color: #54858c;
    }
    
    .burger1 {
        transform: ${isOpen ? 'rotate(45deg)' : 'rotate(0)'};
    }
    
    .burger2 {
      opacity: ${isOpen ? 0 : 1};
    }
      
    .burger3 {
      transform: ${isOpen ? 'rotate(-45deg)' : 'rotate(0)'};
    }
`;

export const SandwichIcon: FC<{ isOpen: boolean }> = ({ isOpen }) => {
    return (
        <div className='relative '>
            <div className='hamburger'>
                <div className='burger burger1 ' />
                <div className='burger burger2 ' />
                <div className='burger burger3 ' />
            </div>
            <style>{styledHamburger(isOpen)}</style>
        </div>
    );
};
