// Publish only verified material with permission to use names, photos and quotes.
// Empty slots intentionally render nothing; never substitute demo data as proof.
export type CustomerStory = { quote: string; name: string; role: string; team: string; photo: string };
export type Founder = { name: string; role?: string; photo: string; story: [string, string, string]; links: { label: string; url: string }[] };
export type Adoption = { count: number; label: string; verifiedOn: string; avatars: { photo: string; alt: string }[] };
export type ExternalProof = { title: string; publisher: string; date: string; url: string };
// D3.2: Supply 3–5 permissioned quotes, faces, names, roles/teams and specific outcomes.
export const CUSTOMER_STORIES: CustomerStory[] = [];
// D3.3: Owner-supplied attribution, image and first-person story.
// A professional-profile URL is still pending; do not invent one.
export const FOUNDER: Founder | null = {
  name: 'Tyler Ans',
  role: 'Owner of Gameday Sports and The Squad Pro',
  photo: '/images/gameday-sports-creator.png',
  story: [
    'I created The Squad and Gameday Sports because I know firsthand how much time and effort goes into coaching, organizing teams, and keeping everyone connected.',
    'I wanted to build something that makes life easier for coaches, athletes, and parents by simplifying the behind-the-scenes work so they can focus on what really matters: playing, developing, and enjoying the game.',
    'At the end of the day, my goal is to make powerful, easy-to-use sports technology accessible to everyone, from grassroots teams to growing sports organizations.',
  ],
  links: [],
};
// D3.1: Supply a verified current team/athlete count and only permissioned avatars.
export const ADOPTION: Adoption | null = null;
// D3.5: Supply dated independent reviews or mentions and their public source URLs.
export const EXTERNAL_PROOF: ExternalProof[] = [];
