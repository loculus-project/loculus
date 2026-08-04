import { describe, expect, test } from 'vitest';

import { formatCitationContributors } from './formatCitationContributors';

describe('formatCitationContributors', () => {
    test('shows all contributors when there are ten or fewer', () => {
        expect(
            formatCitationContributors([
                { givenName: 'Jane', surname: 'Doe' },
                { givenName: 'John', surname: 'Smith' },
                { givenName: 'Alex', surname: 'Jones' },
            ]),
        ).toBe('Jane Doe, John Smith, Alex Jones');
    });

    test('truncates contributor lists longer than ten with an ellipsis', () => {
        expect(
            formatCitationContributors([
                { givenName: 'Jane', surname: 'Doe' },
                { givenName: 'John', surname: 'Smith' },
                { givenName: 'Alex', surname: 'Jones' },
                { givenName: 'Sam', surname: 'Taylor' },
                { givenName: 'Morgan', surname: 'Lee' },
                { givenName: 'Jordan', surname: 'Patel' },
                { givenName: 'Casey', surname: 'Brown' },
                { givenName: 'Taylor', surname: 'Wilson' },
                { givenName: 'Jamie', surname: 'Davis' },
                { givenName: 'Robin', surname: 'Garcia' },
                { givenName: 'Avery', surname: 'Martinez' },
            ]),
        ).toBe(
            'Jane Doe, John Smith, Alex Jones, Sam Taylor, Morgan Lee, Jordan Patel, Casey Brown, Taylor Wilson, Jamie Davis, Robin Garcia, ...',
        );
    });
});
