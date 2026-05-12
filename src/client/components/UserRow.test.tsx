import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRow } from './UserRow';
import type { DashboardUser } from '../types/api';

const baseUser: DashboardUser = {
  userId: 't2_u1',
  username: 'testuser',
  activeStrikes: 2,
  totalStrikes: 2,
  isBanned: false,
  lastUpdated: '2026-01-01T00:00:00.000Z',
};

describe('UserRow', () => {
  it('renders username', () => {
    render(<UserRow user={baseUser} maxStrikes={3} onClick={vi.fn()} />);
    expect(screen.getByText('u/testuser')).toBeDefined();
  });

  it('renders StrikeBar with correct props via aria-label', () => {
    render(<UserRow user={baseUser} maxStrikes={3} onClick={vi.fn()} />);
    expect(screen.getByLabelText('2 of 3 strikes')).toBeDefined();
  });

  it('shows banned badge when isBanned is true', () => {
    render(<UserRow user={{ ...baseUser, isBanned: true }} maxStrikes={3} onClick={vi.fn()} />);
    expect(screen.getByText(/Banned/)).toBeDefined();
  });

  it('does not show banned badge when not banned', () => {
    render(<UserRow user={baseUser} maxStrikes={3} onClick={vi.fn()} />);
    expect(screen.queryByText(/Banned/)).toBeNull();
  });

  it('calls onClick with the user when clicked', async () => {
    const onClick = vi.fn();
    render(<UserRow user={baseUser} maxStrikes={3} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(baseUser);
  });
});
