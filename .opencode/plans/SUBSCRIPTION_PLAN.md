# Subscription & Permission Refinement Plan

## Goal
Refine the subscription and permission system to be **Team-based**, **Predictable**, and **Scalable**, while preserving all existing functionality.

## Core Changes

### 1. Data Model Updates
- **Team Type**: Add `clubId?: string`.
- **New Collection**: `clubs` collection to manage elite subscriptions.
  - Schema: `{ id, name, ownerUserId, subscriptionStatus, maxTeams, createdAt }`.

### 2. Core Logic Updates (`team-provider.tsx`)
Refactor `isPro` and `hasFeature` to be strictly Team/Club based.

#### A. `isPro` Logic Refinement
**Current:** `activeTeam.isPro || userProfile.activePlanId === 'squad_pro'` (Hybrid)
**New:** Strictly check Team & Club status.

```typescript
const isPro = useMemo(() => {
  if (isSuperAdmin) return true;
  
  // 1. Check Team Level Pro
  if (activeTeam?.isPro) return true;

  // 2. Check Club Level Pro
  // (If team belongs to a club, and club is active, return true)
  if (activeTeam?.clubId && clubIsPro) return true;

  return false;
}, [activeTeam, clubIsPro]);
```

#### B. `hasFeature` Logic Refinement
Restrict "Club Owner Only" features (League/Tournament Generation).

**New Feature Keys:**
- `league_generation`: Allowed for Team Pro OR Club Pro (Owner only).
- `tournament_generation`: Allowed for Team Pro OR Club Pro (Owner only).
- `club_management`: Allowed for Club Owner only.

### 3. Feature Gating (UI)
Update UI components to check the new granular permissions.
- **League Generation**: Check `hasFeature('league_generation')`.
- **Tournament Generation**: Check `hasFeature('tournament_generation')`.
- **Club Hub**: Check `hasFeature('club_management')`.

### 4. Club Management
- **Create Club**: Owner with Elite plan can create a Club.
- **Add Teams to Club**: Link teams to Club ID.
- **Team Limit**: Enforce `club.maxTeams` when adding teams.

## Implementation Steps

1.  **Update Types**: Add `clubId` to Team, create Club interface.
2.  **Update Logic**: Refactor `useTeam` hooks (`isPro`, `hasFeature`).
3.  **Update UI**: Update "Generate" buttons and Access Restricted messages.
4.  **Create Club Admin**: Simple page to manage Club (link teams).

## Caveats
- **Legacy Data**: Existing teams without `clubId` will remain standalone.
- **Migration**: Existing "User Pro" access might be lost if we remove `userProfile.activePlanId` check. We should likely **keep** the fallback for existing users or explicitly migrate them.
- *Decision*: We will **keep** the `userProfile.activePlanId` check as a "Legacy Pro" fallback to prevent breaking existing setups, but prioritize Team/Club checks.
