import { expect, test, vi } from 'vitest';

import { replaceWithSettledLeagueCreatorLanding } from '@/lib/login-landing-navigation';

test('replaces the current document with the exact League Creator landing', () => {
  const navigation = { replace: vi.fn() };

  replaceWithSettledLeagueCreatorLanding('/competition', navigation);

  expect(navigation.replace).toHaveBeenCalledOnce();
  expect(navigation.replace).toHaveBeenCalledWith('/competition');
});
