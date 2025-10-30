import { type FC, useMemo, useState } from 'react';
import { Button } from "src/components/common/Button";

type AuthorsListProps = {
    authors: string[];
};

const DEFAULT_AT_LEAST_VISIBLE = 25;
const NUMBER_VISIBLE_LAST_AUTHORS = 1;

export const AuthorList: FC<AuthorsListProps> = ({ authors }) => {
    const [showMore, setShowMore] = useState(false);
    const data = useMemo(() => {
        if (authors.length <= DEFAULT_AT_LEAST_VISIBLE + 3) {
            return {
                showMoreNeeded: false,
            } as const;
        }
        return {
            showMoreNeeded: true,
            beforeEllipsis: authors.slice(0, DEFAULT_AT_LEAST_VISIBLE - NUMBER_VISIBLE_LAST_AUTHORS),
            afterEllipsis: authors.slice(authors.length - NUMBER_VISIBLE_LAST_AUTHORS, authors.length),
        } as const;
    }, [authors]);

    let authorsElements;
    if (!data.showMoreNeeded || showMore) {
        authorsElements = authors.map((author, index) => (
            <span key={index}>
                {author}
                {index === authors.length - 2 ? ' & ' : index !== authors.length - 1 ? ', ' : ''}
            </span>
        ));
    } else {
        authorsElements = (
            <>
                {data.beforeEllipsis.map((author, index) => (
                    <span key={index}>
                        {author}
                        {', '}
                    </span>
                ))}
                <span>..., </span>
                {data.afterEllipsis.map((author, index) => (
                    <span key={index}>
                        {author}
                        {index === data.afterEllipsis.length - 2
                            ? ' & '
                            : index !== data.afterEllipsis.length - 1
                              ? ', '
                              : ''}
                    </span>
                ))}
            </>
        );
    }

    return (
        <div>
            {authorsElements}
            {data.showMoreNeeded && (
                <Button onClick={() => setShowMore(!showMore)} className='ml-2 underline'>
                    {showMore ? 'Show less' : 'Show more'}
                </Button>
            )}
        </div>
    );
};
