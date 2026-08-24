import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EventDeleteConfirmation } from '@/components/events/EventDeleteConfirmation';
import { SportsHubHeader } from '@/components/sports-hub/SportsHubClientLayout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Phase 3 rendered repairs', () => {
  test('event deletion waits for an event-named confirmation and invokes deletion once', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<TooltipProvider><EventDeleteConfirmation event={{ id: 'event-7', title: 'Championship Final' }} onDelete={onDelete} /></TooltipProvider>);

    await user.click(screen.getByRole('button', { name: 'Delete Championship Final' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This will permanently delete Championship Final. This cannot be undone.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete Championship Final' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Deletion' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('event-7');
  });

  test('Sports Hub header keeps full and compact search contracts with one control per action', () => {
    render(<SportsHubHeader />);

    const fullSearch = screen.getByRole('search');
    expect(fullSearch.parentElement).toHaveClass('hidden', 'lg:flex', 'flex-1', 'max-w-sm');

    const controls = [
      ['Search Sports Hub', '/sports-hub/search', 'lg:hidden'],
      ['Back to App', '/dashboard', 'hidden', 'md:inline-flex'],
      ['Get Started', '/login', 'hidden', 'sm:flex'],
    ] as const;

    for (const [name, href, ...classes] of controls) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveClass(...classes);
      expect(link.tagName).toBe('A');
      expect(link.closest('button')).toBeNull();
      expect(link.querySelector('button')).toBeNull();
    }
  });
});
