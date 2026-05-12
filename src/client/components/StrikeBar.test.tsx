import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrikeBar } from './StrikeBar';

describe('StrikeBar', () => {
  it('renders correct number of filled blocks for active/max', () => {
    render(<StrikeBar active={2} max={3} />);
    const filled = screen.getByText('██');
    const empty = screen.getByText('░');
    expect(filled).toBeDefined();
    expect(empty).toBeDefined();
  });

  it('shows all filled when active equals max', () => {
    render(<StrikeBar active={3} max={3} />);
    expect(screen.getByText('███')).toBeDefined();
    // empty span exists but is empty
    const bar = screen.getByLabelText('3 of 3 strikes');
    expect(bar).toBeDefined();
  });

  it('shows all empty when active is 0', () => {
    render(<StrikeBar active={0} max={3} />);
    expect(screen.getByText('░░░')).toBeDefined();
    const bar = screen.getByLabelText('0 of 3 strikes');
    expect(bar).toBeDefined();
  });

  it('has correct aria-label', () => {
    render(<StrikeBar active={1} max={5} />);
    expect(screen.getByLabelText('1 of 5 strikes')).toBeDefined();
  });
});
