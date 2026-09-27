import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { ListOfGroupsOfUser } from './ListOfGroupsOfUser';

test.each([false, true])('empty group guidance matches restricted mode %s', (restricted) => {
    render(<ListOfGroupsOfUser groupsOfUser={[]} requireLogin={restricted} />);
    expect(
        screen.getByText(restricted ? /Contact your instance administrator/ : /please create a group/),
    ).toBeVisible();
});
