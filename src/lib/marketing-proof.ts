// Publish only verified material with permission to use names, photos and quotes.
// Empty slots intentionally render nothing; never substitute demo data as proof.
export type CustomerStory = { quote: string; name: string; role: string; team: string; photo: string };
export type Founder = { name: string; photo: string; story: [string, string, string]; links: { label: string; url: string }[] };
export type Adoption = { count: number; label: string; verifiedOn: string; avatars: { photo: string; alt: string }[] };
export type ExternalProof = { title: string; publisher: string; date: string; url: string };
// D3.2: Supply 3–5 permissioned quotes, faces, names, roles/teams and specific outcomes.
export const CUSTOMER_STORIES: CustomerStory[] = [];
// D3.3: Supply the real founder name/photo, three-sentence story and LinkedIn/X links.
export const FOUNDER: Founder | null = null;
// D3.1: Supply a verified current team/athlete count and only permissioned avatars.
export const ADOPTION: Adoption | null = null;
// D3.5: Supply dated independent reviews or mentions and their public source URLs.
export const EXTERNAL_PROOF: ExternalProof[] = [];
