import React from 'react';
import type { ContactConfig } from '../../types/config.ts';

const ErrorContactMessage: React.FC<ContactConfig> = ({ gitHubIssuesUrl, issuesEmail }) => {
    if (!gitHubIssuesUrl && !issuesEmail) {
        return null;
    }

    return (
        <div>
            If the problem persists, feel free to
            {gitHubIssuesUrl && (
                <>
                    {' '}
                    <a href={gitHubIssuesUrl} target='_blank' rel='noopener noreferrer'>
                        submit an issue on GitHub
                    </a>
                </>
            )}
            {gitHubIssuesUrl && issuesEmail && ' or '}
            {issuesEmail && (
                <>
                    {' '}
                    email us at <a href={`mailto:${issuesEmail}`}>{issuesEmail}</a>
                </>
            )}
            .
        </div>
    );
};

export default ErrorContactMessage;
