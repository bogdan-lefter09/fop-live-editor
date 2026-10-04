import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../../src/renderer/components/ConfirmDialog';

const setup = (props = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ConfirmDialog show title="Delete File" message="Sure?" confirmText="Delete" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('renders nothing when hidden', () => {
    setup({ show: false });
    expect(screen.queryByText('Delete File')).not.toBeInTheDocument();
  });

  it('shows title, message and custom button text', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Delete File' })).toBeInTheDocument();
    expect(screen.getByText('Sure?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onConfirm / onCancel from the buttons', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('supports Enter and Escape keys', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when clicking the overlay but not the dialog itself', async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByText('Sure?'));
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(document.querySelector('.confirm-dialog-overlay')!);
    expect(onCancel).toHaveBeenCalled();
  });

  it('passes the "don\'t ask again" choice to onConfirm', async () => {
    const { onConfirm } = setup({ showSkipOption: true });
    await userEvent.click(screen.getByLabelText("Don't ask me again"));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('marks destructive confirms with the danger style', () => {
    setup({ isDestructive: true });
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn-danger');
  });
});
