type DocumentNavigation = Pick<Location, 'replace'>;

export function replaceWithSettledLeagueCreatorLanding(
  path: '/competition',
  navigation: DocumentNavigation = window.location,
): void {
  navigation.replace(path);
}
