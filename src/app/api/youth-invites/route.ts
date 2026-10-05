// Backward-compatible alias for the canonical Family Hub youth-invitation API.
// Keeping one implementation prevents token format, redemption, and authority
// semantics from diverging between two public endpoints.
export { GET, POST, PUT } from '../invites/youth/route';
