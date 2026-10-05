import type { Resource } from "./schedule";
export function venueKey(resource: Resource | undefined): string {
  return (
    resource?.venueId ||
    (resource?.venueName?.trim()
      ? `name:${resource.venueName.trim().toLowerCase()}`
      : "unspecified")
  );
}
export function surfaceLabel(resource: Resource): string {
  const field = resource.surfaceName || resource.name;
  return resource.venueName && !field.startsWith(resource.venueName)
    ? `${resource.venueName} — ${field}`
    : field;
}
export function competitionVenues(resources: Resource[]) {
  const venues = new Map<
    string,
    { id: string; name: string; address: string; resources: Resource[] }
  >();
  for (const resource of resources) {
    const id = venueKey(resource);
    const venue = venues.get(id) || {
      id,
      name: resource.venueName || "Venue not specified",
      address: resource.address || "",
      resources: [],
    };
    venue.resources.push(resource);
    if (!venue.address && resource.address) venue.address = resource.address;
    venues.set(id, venue);
  }
  return [...venues.values()];
}
