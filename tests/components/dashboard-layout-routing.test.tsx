import { act, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  authUser: { uid: 'fixture-user', isAnonymous: false },
  profile: null as null | { role: string },
  pathname: '/dashboard',
  searchParams: new URLSearchParams(),
  isParent: false,
  isSchoolMode: false,
  isPrimaryClubAuthority: false,
  activeTeam: null as null | { type?: string },
  router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => harness.router,
  usePathname: () => harness.pathname,
  useSearchParams: () => harness.searchParams,
}));

vi.mock('@/firebase', () => ({
  useUser: () => ({ user: harness.authUser, isUserLoading: false, isAuthResolved: true }),
  useAuth: () => ({ currentUser: harness.authUser, app: { options: {} } }),
  useFirestore: () => ({}),
}));

vi.mock('@/components/providers/team-provider', () => ({
  useTeam: () => ({
    teams: [],
    isTeamsLoading: false,
    isSeedingDemo: false,
    setIsSeedingDemo: vi.fn(),
    user: harness.profile,
    activeTeam: harness.activeTeam,
    isPrimaryClubAuthority: harness.isPrimaryClubAuthority,
    isSchoolMode: harness.isSchoolMode,
    isEliteClubMode: false,
    isParent: harness.isParent,
  }),
}));

vi.mock('@/components/layout/Shell', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/layout/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/layout/AlertOverlay', () => ({ AlertOverlay: () => null }));
vi.mock('@/components/StripePaywall', () => ({ StripePaywall: () => null }));
vi.mock('@/components/layout/QuotaResolutionOverlay', () => ({ QuotaResolutionOverlay: () => null }));
vi.mock('@/components/layout/BetaNotificationBanner', () => ({ BetaNotificationBanner: () => null }));
vi.mock('@/app/(dashboard)/competition/page', () => ({ default: () => <h1>Competition Hub</h1> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }));
vi.mock('@/lib/db-seeder', () => ({ seedGuestDemoTeam: vi.fn() }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/utils', () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(' ') }));
vi.mock('@/lib/client-auth', () => ({
  DEMO_EXIT_PENDING_KEY: 'demo-exit-pending',
  DEMO_START_KEY: 'demo-start',
  getAuthToken: vi.fn(),
  authHeader: vi.fn(() => ({})),
  clearBrowserSession: vi.fn(),
}));
vi.mock('lucide-react', () => ({
  Loader2: () => null,
  Timer: () => null,
}));

import DashboardLayout from '@/app/(dashboard)/layout';

const renderLayout = () => render(<DashboardLayout><main><h1>Dashboard</h1></main></DashboardLayout>);

describe('dashboard settled-role routing', () => {
  beforeEach(() => {
    harness.profile = null;
    harness.pathname = '/dashboard';
    harness.isParent = false;
    harness.isSchoolMode = false;
    harness.isPrimaryClubAuthority = false;
    harness.activeTeam = null;
    harness.router.push.mockReset();
    harness.router.replace.mockReset();
  });

  test('renders the League Creator hub in place when the role hydrates on dashboard', async () => {
    const view = renderLayout();
    await waitFor(() => expect(harness.router.push).not.toHaveBeenCalledWith('/competition'));

    harness.profile = { role: 'league_creator' };
    await act(async () => view.rerender(<DashboardLayout><main><h1>Dashboard</h1></main></DashboardLayout>));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Competition Hub' })).toBeInTheDocument());
    expect(harness.router.push).not.toHaveBeenCalledWith('/competition');
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  test('preserves Parent and School Admin dashboard redirects', async () => {
    harness.profile = { role: 'parent' };
    harness.isParent = true;
    const parent = renderLayout();
    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith('/family'));
    parent.unmount();

    harness.router.push.mockReset();
    harness.isParent = false;
    harness.profile = { role: 'admin' };
    harness.isSchoolMode = true;
    harness.isPrimaryClubAuthority = true;
    harness.activeTeam = { type: 'school' };
    renderLayout();
    await waitFor(() => expect(harness.router.replace).toHaveBeenCalledWith('/club'));
  });

  test('shows a visible secure-hub boundary while dashboard content suspends', async () => {
    harness.pathname = '/family';
    harness.profile = { role: 'parent' };
    harness.isParent = true;

    let resolved = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = () => {
        resolved = true;
        resolve();
      };
    });
    function SuspendedFamily() {
      if (!resolved) throw pending;
      return <main>Family content ready</main>;
    }

    render(<DashboardLayout><SuspendedFamily /></DashboardLayout>);

    expect(screen.getByText('Synchronizing Secure Hub...')).toBeInTheDocument();

    await act(async () => release());
    expect(await screen.findByText('Family content ready')).toBeInTheDocument();
  });
});
