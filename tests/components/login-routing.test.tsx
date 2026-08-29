import { render, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  profile: { role: 'parent', email: 'parent@example.test' } as Record<string, unknown> | null,
  claimRole: 'parent',
  sessionRedirect: null as '/onboarding' | '/teams/join' | null,
  router: { push: vi.fn(), replace: vi.fn() },
  getDoc: vi.fn(),
  establish: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => harness.router }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/firebase', () => ({
  useAuth: () => ({}),
  useUser: () => ({
    user: {
      uid: 'parent-uid',
      email: 'parent@example.test',
      emailVerified: true,
      isAnonymous: false,
      getIdTokenResult: async () => ({ claims: { role: harness.claimRole } }),
    },
    isUserLoading: false,
  }),
  useFirestore: () => ({}),
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({ path: 'users/parent-uid' }),
  getDoc: (...args: unknown[]) => harness.getDoc(...args),
  updateDoc: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(), signInAnonymously: vi.fn(), signOut: vi.fn(), signInWithPopup: vi.fn(),
  GoogleAuthProvider: class {}, sendPasswordResetEmail: vi.fn(), browserPopupRedirectResolver: {},
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/BrandLogo', () => ({ default: () => null }));
vi.mock('@/lib/client-auth', () => ({
  bootstrapDemoWorkspace: vi.fn(), clearBrowserSession: vi.fn(), establishBrowserSession: vi.fn(),
  establishBrowserSessionOrSignOut: (...args: unknown[]) => harness.establish(...args),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock('@/components/ui/input', () => ({ Input: () => <input /> }));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('lucide-react', () => Object.fromEntries([
  'Trophy', 'Users', 'Zap', 'Loader2', 'User', 'Baby', 'ChevronRight', 'ChevronLeft',
  'ShieldAlert', 'GraduationCap', 'Eye', 'EyeOff',
].map(name => [name, () => null])));

import LoginPage from '@/app/login/page';

const UNSAFE_RETURN_PATHS = [
  '/\\evil.example',
  '//evil.example',
  '///evil.example',
  'https://evil.example',
  'javascript:alert(1)',
  '/%5cevil.example',
  '/%255cevil.example',
  '/%25255cevil.example',
  '/%2fevil.example',
  '/%252fevil.example',
  '/https:%2f%2fevil.example',
  '/java%73cript:alert(1)',
  '/\tevil.example',
  '/%09evil.example',
  '/%2509evil.example',
  '/calendar%00',
  '/a/../admin',
  '/%',
];

describe('login settled-role routing', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
    harness.profile = { role: 'parent', email: 'parent@example.test' };
    harness.claimRole = 'parent';
    harness.sessionRedirect = null;
    harness.router.push.mockReset();
    harness.router.replace.mockReset();
    harness.establish.mockReset();
    harness.establish.mockImplementation(async () => ({ redirectTo: harness.sessionRedirect }));
    harness.getDoc.mockReset();
    harness.getDoc.mockImplementation(async () => ({
      exists: () => harness.profile !== null,
      data: () => harness.profile,
      ref: {},
    }));
  });

  test('routes a known parent directly to Family without rendering Dashboard first', async () => {
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith('/family'));
    expect(harness.router.push).not.toHaveBeenCalledWith('/dashboard');
  });

  test('preserves an approved return path before applying the parent default landing', async () => {
    sessionStorage.setItem('squad_return_path', '/calendar?view=month#today');
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith('/calendar?view=month#today'));
    expect(harness.router.push).not.toHaveBeenCalledWith('/family');
    expect(harness.router.push).not.toHaveBeenCalledWith('/dashboard');
  });

  test.each(UNSAFE_RETURN_PATHS)('rejects unsafe stored return path %s before parent navigation', async returnPath => {
    sessionStorage.setItem('squad_return_path', returnPath);
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith('/family'));
    expect(harness.router.push).not.toHaveBeenCalledWith(returnPath);
    expect(sessionStorage.getItem('squad_return_path')).toBeNull();
  });

  test.each(UNSAFE_RETURN_PATHS)('does not persist unsafe returnTo query value %s', async returnPath => {
    window.history.replaceState({}, '', `/login?returnTo=${encodeURIComponent(returnPath)}`);
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith('/family'));
    expect(harness.router.push).not.toHaveBeenCalledWith(returnPath);
    expect(sessionStorage.getItem('squad_return_path')).toBeNull();
  });

  test.each([
    ['trusted superadmin', { role: 'member' }, 'superadmin', '/admin'],
    ['school administrator', { role: 'admin' }, 'admin', '/club'],
    ['ordinary member', { role: 'member' }, 'member', '/dashboard'],
    ['missing profile', null, 'member', '/onboarding'],
  ])('preserves the %s landing', async (_name, profile, claimRole, landing) => {
    harness.profile = profile;
    harness.claimRole = claimRole;
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.push).toHaveBeenCalledWith(landing));
  });

  test('preserves mandatory setup admission before reading a landing profile', async () => {
    harness.sessionRedirect = '/teams/join';
    render(<LoginPage />);

    await waitFor(() => expect(harness.router.replace).toHaveBeenCalledWith('/teams/join'));
    expect(harness.getDoc).not.toHaveBeenCalled();
    expect(harness.router.push).not.toHaveBeenCalled();
  });
});
