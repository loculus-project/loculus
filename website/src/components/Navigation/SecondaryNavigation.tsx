export const SecondaryNavigation = ({ url }: { url: string }) => {
    const splitUrl = url.split('/');
    const curPage = splitUrl[splitUrl.length - 1];

    if (curPage === 'user') {
        return null;
    }

    return (
        <div className='flex justify-end text-sm py-3'>
            <div className='subtitle hidden sm:flex sm:z-6 gap-2'>
                <SecondaryLink text='Browse' url='/search' isActive={curPage === 'search'} />
                <span className='text-gray-500 mx-2'>|</span>
                <SecondaryLink text='Submit' url='/submit' isActive={curPage === 'submit'} />
                <span className='text-gray-500 mx-2'>|</span>
                <SecondaryLink text='Revise' url='/revise' isActive={curPage === 'revise'} />
            </div>
        </div>
    );
};

export const SecondaryLink = ({ text, url, isActive }: { text: string; url: string; isActive: boolean }) => {
    return (
        <a
            href={url}
            className={`inline-block hover:no-underline px-1 ${isActive ? 'text-orange-400' : 'text-gray-500'}`}
        >
            {text}
        </a>
    );
};
