import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { ListOfGroupsOfUser } from './ListOfGroupsOfUser';
import { loginIsRequired } from '../../config';

vi.mock('../../config', () => ({ loginIsRequired: vi.fn() }));

test.each([false, true])('empty group guidance matches restricted mode %s', (restricted) => {
    vi.mocked(loginIsRequired).mockReturnValue(restricted);
    render(<ListOfGroupsOfUser groupsOfUser={[]} />);
    expect(
        screen.getByText(restricted ? /Contact your instance administrator/ : /please create a group/),
    ).toBeVisible();
});
