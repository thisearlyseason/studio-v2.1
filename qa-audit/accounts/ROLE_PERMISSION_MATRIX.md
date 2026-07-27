# Role-permission matrix

This matrix describes server-enforced behavior. “Conditional” means team-local position, ownership, membership, target record, or active subscription is also required. “Failed” means the intended UI workflow and backend permission do not currently agree.

| Action | parent | adult player | youth player | coach | admin | league creator | superadmin |
|---|---|---|---|---|---|---|---|
| Read own profile | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| Edit safe profile fields | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| Edit role/billing/security fields | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Read another user profile | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Join team by code | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Choose staff role in join payload | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Read active team | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Create team | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Edit team identity | Denied | Denied | Denied | Conditional owner | Conditional owner | Conditional owner | Allowed |
| Delete team | Denied | Denied | Denied | Conditional owner | Conditional owner | Conditional owner | Allowed |
| Add/edit/remove ordinary members | Denied | Denied | Denied | Conditional staff; authority changes owner-only | Conditional staff | Conditional staff | Allowed |
| Create/edit schedules | Denied | Denied | Denied | Conditional staff | Conditional staff | Conditional staff | Allowed |
| Enter scores/standings | Denied | Denied | Denied | Conditional staff | Conditional staff | Conditional staff | Allowed |
| Create drills/playbooks/docs | Denied | Denied | Denied | Conditional staff | Conditional staff | Conditional staff | Allowed |
| Read team chat | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Send own chat message | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Create/moderate chat | Denied | Denied | Denied | Conditional owner | Conditional owner | Conditional owner | Allowed |
| Send team alert | Denied | Denied | Denied | Conditional owner | Conditional owner | Conditional owner | Allowed |
| Receive targeted alert | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Upload/download private files | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| View/edit own child | Allowed | Not applicable | Not applicable | Denied unless coach-of-player path | Denied unless team authority | Denied | Allowed |
| Create league | Conditional server cap | Conditional server cap | Denied by UI | Conditional server cap | Conditional server cap | Conditional server cap | Allowed |
| Edit/delete league | Denied | Denied | Denied | Conditional creator | Conditional creator | Conditional creator | Allowed |
| Read another league | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Create/edit tournament | Conditional creator | Conditional creator | Conditional creator | Conditional creator | Conditional creator | Conditional creator | Allowed |
| Create/manage school groups | Denied | Denied | Denied | Denied | Conditional owner/delegate | Denied | Allowed |
| Manage own subscription | Conditional account owner | Conditional | Conditional | Conditional | Conditional | Conditional | Allowed |
| Manage team billing/payment setup | Denied | Denied | Denied | Conditional team owner | Conditional hub owner | Conditional owner | Allowed |
| View another account billing | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Transfer ownership | Denied | Denied | Denied | Not supported safely in browser | Not supported safely in browser | Not supported safely in browser | Conditional |
| Access admin APIs/data | Denied | Denied | Denied | Denied | Denied | Denied | Allowed |
| Impersonate | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not supported |
| Request account deletion | Conditional ownership/subscription guards | Conditional | Conditional | Conditional | Conditional | Conditional | Conditional safeguards |

## Important interpretation

- Global `admin` means an institutional/school account, not platform administrator.
- `Admin` membership does not equal `superadmin`.
- Billing and plan state are server-owned and cannot be written from the browser.
- Supported tournaments are team-scoped events and inherit team/staff/plan controls. The unused legacy root tournament collection is admin-only.
- Protected direct URLs require a revocation-checked HTTP-only Firebase session before the page renders.
