import { SandwichMenu } from './SandwichMenu';

export const Navigation = ({ url }: { url: string }) => {
    const whatTab = url.includes('/user') ? 'user' : 'ebola';

    return (
        <div className='flex justify-end'>
            <div className='subtitle hidden sm:flex sm:z-6 gap-4'>
                <TabLink text='Ebolavirus' url='/search' isActive={whatTab === 'ebola'} />
                <TabLink text='Seasonal coronaviruses' url='/notimplemented' isActive={false} />

                <div className='border-l h-full  mx-2 border-gray-400'></div>
                <TabLink text='My account' url='/user' isActive={whatTab === 'user'} />
            </div>

            <div className='sm:hidden fixed z-0'>
                <SandwichMenu top={16} right={28} />
            </div>
        </div>
    );
};
export const TabLink = ({ text, url, isActive }: { text: string; url: string; isActive: boolean }) => {
    return (
        <a
            href={url}
            className={`tab-link ${isActive ? 'border-b-2 border-orange-500' : ''} 
                        hover:border-b-2 hover:border-orange-500 
                        transition-border duration-200 
                         inline-block pb-1 hover:no-underline`}
            onClick={
                // if url is not implemented, prevent default action and display a message
                (e) => {
                    if (url === '/notimplemented') {
                        e.preventDefault();
                        alert('This page is not implemented yet.');
                    }
                }
            }
        >
            {text}
        </a>
    );
};
