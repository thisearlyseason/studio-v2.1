# Website audit completion check — November 16, 2026

Source: https://app.heycatch.ai/audit/hck_pk_APvOG4sebjLfK6k-1DXlNpFKJICaSF8m?surface=website

The current displayed report is 72/100. These are report scores, not projected scores after these changes. Every dimension, finding insight and action-plan group was read. Previous releases already addressed organizer coverage and the duplicate About title; this pass closes omissions found by reviewing the entire latest action plan.

## Action plan, in report order

| Priority | Exact action title | Disposition |
| --- | --- | --- |
| Quick wins | Rewrite the hero headline to the brief's category-first line | User explicitly overrides this recommendation: preserve original DOMINATE YOUR SEASON hero and small example screenshot. Do not silently replace it. |
| Quick wins | Render paid prices in the served HTML and in the product schema | Homepage server loads fresh public catalog quotes, seeds visible price components, and emits paid offers. Missing/expired quotes use the existing unavailable/loading fallback. No hardcoded paid prices. |
| Quick wins | Surface the organizer and athletic-director paths on the homepage | Already live: six role cards, including schools, leagues/tournaments and club directors, with audience and pricing links. |
| Quick wins | Add a named person to the About page | Clean, hidden FOUNDER slot exists; actual identity, photo, first-person story and professional-profile link must come from owner. |
| Quick wins | Give the About page a distinct search title | Uses exact suggested absolute title and matching Gameday Sports description. |
| Quick wins | Soften the autoplay hero video on phones | Static existing poster below 768px; desktop video, selector, pause, reduced-motion and low-data behavior retained. |
| Do this quarter | Collect five named customer stories and one real usage count | Empty verified-only slots already exist above homepage pricing; now also on About. Need permissioned quotes, photos, roles, outcomes and dated sourced usage count. |
| Do this quarter | Publish a short security and data-handling page for school buyers | /security describes actual data, guardian access, roles, public sharing, Stripe, operator and retention, with privacy/refund/safety links. Linked from homepage note, School District card and school role. No invented certifications, uptime guarantees or vendor-stability claims. |
| Bigger bets | Earn one dated third-party signal and show it | External work skipped: verified-only EXTERNAL_PROOF slot remains empty. Need a real dated independent source; do not invent reviews or register profiles without owner direction. |

## Every below-maximum finding

| Finding | Current audit score | Repo disposition / remaining limit |
| --- | --- | --- |
| D1.1 | 4/6 | Category line exists; dominant headline retained by explicit user preference. |
| D1.2 | 4/5 | Club role now names separate-team subscription stacking outside pricing. |
| D1.3 | 2/4 | Organizer jobs, audience links and task-focused waiver copy already live. |
| D1.4 | 2/3 | Free/migration guidance already live; new security page supplies actual data/access/operator information. No unsupported stability promises. |
| D1.5 | 2/3 | Real product screenshots labeled demo data already live. A customer's actual after-state needs permissioned real customer evidence. |
| D1.6 | 3/4 | Jargon labels removed; original hero wording remains an explicit exception. |
| D2.1 | 5/7 | Category and product example already live; hero dominance/screenshot size retained by user instruction. |
| D2.2 | 4/5 | Existing named/described demo dialog retained; trigger now references the visible destination explanation. |
| D2.3 | 4/5 | Sentence-case, lighter secondary headings outside hero/pricing; completed pricing design preserved. |
| D2.4 | 3/4 | Organizer links and mobile Pricing already live; install control follows account actions. Anchor navigation is retained; unlinked /features and /customers 404s were explicitly not defects in the audit. |
| D2.5 | 2/4 | Static mobile poster and responsive checks. Audit caps this without its own device evidence; a viewport check is not a physical-device certification. |
| D3.1 | 1/4 | ADOPTION=null; needs real verified usage count and permitted avatars. |
| D3.2 | 1/5 | CUSTOMER_STORIES=[]; homepage, plans and About slots ready; five quotes and real case study still require collection. |
| D3.3 | 2/4 | About, contact and FOUNDER slot exist; owner must supply real person evidence. |
| D3.4 | 3/4 | /security and direct school/pricing links explain actual policy and data handling. Card-saved-upfront trial terms are accurate and unchanged. |
| D3.5 | 1/3 | EXTERNAL_PROOF=[]; needs real review/rating/mention and source/date. |
| D5.1 | 2/3 | Exact audit title and matching description on About; other titles untouched. |
| D5.4 | 2/3 | Mobile video eliminated; desktop video retained by user preference. No unsupported total-transfer/performance score claims. |

D2.B scope-honesty bonus is +1/2; honest free-plan guidance is retained. D4.B is +0/1 because five tiers make a table a base requirement, not a bonus. Neither bonus is a required missing feature.

Full-mark findings D4.1 (2/2), D4.2 (4/4), D4.3 (5/5), D4.4 (4/4), D5.2 (2/2), D5.3 (4/4), D5.5 (3/3) are preserved. Server price initialization and the requested security link implement explicit action items without changing pricing terms, card design, comparison capabilities or existing schema/FAQ fields.
