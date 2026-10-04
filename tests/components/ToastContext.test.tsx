import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../../src/renderer/context/ToastContext';

const Trigger = ({ message = 'Saved', type }: { message?: string; type?: 'success' | 'error' }) => {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, type)}>fire</button>;
};

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('shows a toast and auto-dismisses it after 3.5s', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3400); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('stacks multiple toasts', async () => {
    render(<ToastProvider><Trigger message="One" /><Trigger message="Two" type="error" /></ToastProvider>);
    const [a, b] = screen.getAllByText('fire');
    await userEvent.click(a);
    await userEvent.click(b);
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  it('throws when useToast is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });
});
