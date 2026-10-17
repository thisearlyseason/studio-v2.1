# Squad Pages — isolated local review

This candidate is based on live commit `0d1068196520d352ddcc7eeb85209cbfb63cbfa2`. It adds a structured page editor, three shared-content templates, server-scoped drafts/publications, exact-revision approval, private optimized images, and public `/p/[slug]` pages. Existing prices, allocation limits, checkout, waivers, guardian flows, and released team/auth fixes are unchanged.

**Owner conditionally requested deployment after clean testing and independent review. Production activation remains gated by exact-source release review, required infrastructure verification, and existing access denials. This local candidate does not grant permission to change security rules, IAM, credentials or migrations.**

## Open the working local review

From the enclosing `squad-public-page-implementation-20261016` directory:

```sh
python3 -I -S -B run-local-preview.py
```

The runner binds only `127.0.0.1:9347`, supplies an invalid synthetic Firebase configuration, blocks outbound Node networking, and uses fictional records in `local-page-data`. It inherits no production environment. Stop it with Ctrl+C; do not run multiple copies against the same data directory. The development fixture adapter is serialized within one process; it is not a production database.

- Editor: `http://127.0.0.1:9347/squad-pages`
- Simple: `http://127.0.0.1:9347/p/river-city-hawks-simple`
- Modern: `http://127.0.0.1:9347/p/river-city-hawks-modern`
- Sports / Bold: `http://127.0.0.1:9347/p/river-city-hawks-bold`

The three review pages contain the same fictional story and images. Choose the matching fictional entity in the editor to change one. The main Hawks editor is left as a polished Modern example. The role selector exists only in loopback development fixtures and cannot enable in production or Vercel. Free-team and unrelated-account roles demonstrate restrictions. The included local data preserves earlier test records and published revisions.

To demonstrate image replacement: open **Registration**, change **Join heading** and **Join description**, replace **Join background**, adjust alternative text/focal point/overlay, then **Save draft**. Reload: the draft persists and public content stays unchanged. **Publish revision** explicitly updates the local public page. Removing the image gives a colour fallback. Every customer image location has upload, replacement and removal controls; logos preserve proportions. Uploads accept raster images up to 5 MB/25 MP and become oriented, at-most-2048px still WebP images. Public delivery offers480/960/1440px variants; below-hero images lazy-load.

**Page settings** contains stable slug availability, search metadata, independent official footer toggles, organization publication policy, and persisted actor-owned unused-upload inventory. Deletion rechecks saved/live/previous references transactionally; a tombstone prevents a concurrent save from attaching a deleted image. Protected revisions are retained. Files that could not be deleted remain private and require retry/administrator cleanup; unknown cleanup is never reported as complete.

## Existing plan and identity mapping

| Existing source of coverage | Page behavior |
| --- | --- |
| Free/Starter owner or authorized admin | Private draft and preview; server denies publication |
| Single Team Pro | Covered canonical `isPro` team with paid team plan and current billing owner; one page for that entity |
| Elite/club owner | One canonical owner-keyed club page; separate pages only for actually allocated paid squads within existing allowance/add-ons |
| League | One page per covered existing league entity; allocated covered team pages. An association alone grants no team coverage |
| School | Existing school hub page; program pages use existing allocated playable `school_squad` records. A school competition stored as a league retains its league identity |
| Tournament | Existing paid host entitlement covers its tournament; registration closing does not end page coverage |
| Tournament participant | Participation grants no independent team page |

Capacity comes from current `team_limit`/`proTeamLimit` and existing allocation flags. No slots are allocated or reassigned here. Existing checkout caps extra-team add-ons at50; this implementation does not change it. Legacy club document IDs that differ from the authoritative owner identity are explicitly blocked pending verified mapping; they never silently alias another club. Queries fail closed above250 matching records; any future high-volume job must paginate rather than relax that bound.

Page editing never grants billing authority. Explicit school/org admins can approve their organization pages. A league creator may manage that league without gaining permission to change another billing organization's publication policy. New policies require owner/admin approval for each saved team revision; any draft change clears approval.

## Registration and public information

Form choices are read from the selected entity’s existing authoritative registrations. Team/program/school pages discover ordinary public events and tournaments nested under that exact team, plus leagues whose `tenantId` exactly matches it. League/tournament pages retain their own form scope. Shared ownership alone never grants a form association. Private, unpublished, archived, removed and unauthorized forms are excluded; invitation codes and entrant records are never read or exposed. Canonical absolute Squad registration URLs normalize before the entity/form check. Team join-by-code flows are not treated as public forms. External HTTPS registration links are allowed; iframe/script embeds are not. New drafts automatically connect a sole open form; with multiple forms, the manager selects the desired forms. Existing drafts and published selections are preserved. The Registration panel refreshes choices on entry, window focus, every 30 visible seconds and via Refresh forms, without replacing unsaved edits. Published page reads recheck current availability and hide removed/private form references without editing saved revisions. Button labels remain manager-owned; form schemas, current fields and submissions remain in the canonical registration workflow. Known capacity/deadline/bracket closures are advisory display status; unknown legacy counters are left to the existing transaction. Dedicated existing registration routes preserve payments, waivers, guardian requirements and duplicate-submission controls. No new submission database or popup workflow is introduced.

Covered published child pages form organization directories using their published names. League/tournament editors offer existing public schedule/standings/bracket/result URLs; no private roster, chat, attendance, submission, guardian or contact DTO is embedded. Contact email is entered explicitly. Text renders as escaped paragraphs with optional `**bold**`; no arbitrary markup executes.

## Additive persistence and delivery

- `squadPagesPrivate/{entityKey}`: versioned draft, live and previous revisions, publication pointer and coverage state.
- `squadPageSlugs/{slug}`: transactional unique stable slug claim.
- `squadPagePolicies/{organizationKey}`: page-only publication policy.
- `squadPageMedia/{entityKey}/items/{imageId}`: scoped image metadata/tombstones.
- Storage `squadPagesPrivate/{entityKey}/{imageId}`: server-proxied private media, no download-token URLs. The existing deadline-bounded storage client and generation checks protect upload cleanup.

No customer data backfill or destructive migration is required. Existing default-deny Firestore and Storage fallbacks protect these new server-only paths; no rules were changed or deployed. The Firestore adapter uses actual transactions with reads before queued writes. HTML/API/media are no-store; public delivery rechecks explicit publication and entitlement before returning data. No advertising or tracking is added.

Web coverage uses configurable `SQUAD_PAGES_GRACE_DAYS` (default7, bounded0–30) from the first observed loss, retained across reads. Old plan-sync timestamps cannot establish a cancellation date. Existing native billing grace is respected without adding another seven days. Expiry retains drafts/settings and requires explicit republishing after recovery. Public requests enforce expiry; the bounded reconciliation helper is unscheduled. Exact cancellation-time webhook/reconciliation integration and deployed scheduling remain unverified.

## Activation gates and rollback

Both `SQUAD_PAGES_ENABLED=true` and `NEXT_PUBLIC_SQUAD_PAGES_ENABLED=true` are required; both default off. The public client flag is a build-time Next flag. Never set `SQUAD_PAGES_PREVIEW_FIXTURES` in hosting; it is independently disabled by production/VERCEL. No production environment was changed.

Before any hosted preview: owner approves the complete local result. Before production activation: independently review the exact candidate, verify production Admin/storage configuration and private bucket IAM/token behavior, verify deployed default-deny rules without bypassing any previous denial, validate applicable staging registration/payment/waiver and tenant flows, and coordinate entitlement reconciliation/scale requirements. No real purchases, customer writes, secret inspection, or device/store work is part of local verification. Local storage and Firestore-emulator results do not establish cloud storage/IAM or deployed scheduler proof.

Rollback: set both feature flags off and rebuild/redeploy the previously approved application through an independently authorized release. Keep all page documents and media; disabling must not delete customer content. The current live release remains untouched by this local work.

## Focused verification

Run `node --test tests/squad-pages-*.test.mjs`, typecheck, lint, and a local production build. The enclosing evidence directory contains retained initial failures, their corrections, regression logs, actual HTTP/browser checks, Firestore-emulator transaction/privacy checks, screenshots, and final independent review. Do not interpret these focused checks as a rerun of the historical complete suite or as deployed integration proof.


## Editor presentation and local review

Desktop editing keeps the settings pane and page preview independently scrollable, with the main controls visible. The preview runs in a same-origin sandboxed iframe with real 1440/768/390-pixel desktop/tablet/mobile viewports. A narrow workspace scrolls horizontally rather than pretending that a mobile-width canvas is desktop. Mobile uses Edit page / Preview page tabs. Field edits preserve the preview scroll position.

The hero focal marker uses the full uncropped image: pointer/touch dragging and arrow keys update the same saved percentage coordinates as the fallback sliders (Shift changes ten percent). Public responsive image crops reuse those coordinates. Optional page background, gallery row/mosaic/staggered layout, gallery expansion toggle and header-menu titles/targets persist with the normal private revision workflow. Omitted settings retain the template defaults. Custom menu targets allow existing section anchors or validated public HTTPS destinations. Empty or hidden sections do not generate dead menu links; registration sections require a valid connected destination even when their saved copy/images are retained.

Draft-preview outbound links open a destination-inspection dialog instead of silently doing nothing. In loopback fictional review, public-page links also show an explicitly fictional destination preview. These dialogs do not submit registrations, send email, run payments or open provider-backed account actions. Hosted public pages keep their ordinary existing destinations; local fixture behavior is gated by the existing nonproduction preview guard. Gallery and link dialogs support iframe-local keyboard trapping, Escape, and focus restoration.


Local editor follow-up: fitted previews and image controls

The selected preview remains a real 1440/768/390 CSS-pixel viewport. A ResizeObserver measures its available pane and proportionally scales the iframe down to fit, with its own vertical document scrolling. It refits on pane/window changes without replacing the frame or draft. Small panes necessarily show smaller text; switch to tablet/mobile or Preview for a larger reading area.

Every cropped photo has an accessible draggable focal marker (pointer/touch, arrows at 1%, Shift+arrows at 10%), announced X/Y coordinates, Frame size (70–130%), Crop zoom (100–200%), and a reset for size/crop/focus. Frame size changes responsive image-frame height; zoom magnifies within the clipped frame. Focal position and zoom do not stretch the source image. Existing images retain template defaults when the optional per-photo size/zoom fields are absent. Logos retain proportional contain rendering and a Logo size control, with no crop/zoom/focus that would misleadingly imply cropping. Full lightbox images remain uncropped. Duplicate horizontal/vertical focal sliders were removed; Text overlay remains on hero/join images where it actually darkens text backgrounds.

Header & menu starts with Header button: Show header button, Header button label, Header button destination, and Use automatic registration button. Legacy pages still use the first open registration automatically. Custom targets accept existing section anchors or safe public HTTPS URLs, never arbitrary internal/private form paths. A button targeting a hidden/empty section is omitted. Mobile visitors can reach the button through Explore. Preview inspection dialogs restore focus to Explore if that menu has closed.

Preview dialogs retain Radix Root/Content/Title/Description together in the parent document and are positioned inside the preview pane. This keeps development accessibility checks and focus scope in the same document as the semantic title. Gallery bodies scroll within the pane; standalone public dialogs retain the normal body portal. Hero/join frame resizing also scales vertical text padding; text content sets a safe minimum height rather than being clipped to a strict photo height.

Entitlement security follow-up: account and allocated-team canonical plans must be explicitly one of team/elite/league/school; stale active status and unknown/inherited plan keys cannot grant coverage. School capacity is checked against all active allocated playable squads owned by the billing account before filtering a selected school directory. Free administrators keep private drafts; tournament participation alone grants no entitlement, while independent valid paid allocation remains eligible.


New uploads are bounded to 5 MB and 25 megapixels, decoded and auto-oriented, and resized proportionally within 2048 pixels without enlargement. Opaque photos use a quality-bounded JPEG/WebP candidate; logos and alpha images use lossless PNG/WebP candidates. Sanitized original encodings remain eligible when no orientation/resize is required. Selection never stores more bytes than the supplied input. Already compact inputs need not shrink; mandatory transforms that cannot fit the original byte budget return an explicit export request rather than storing a larger or arbitrarily degraded conversion.

Upload responses show actual stored dimensions and byte savings. Private metadata is stripped while required color/rendering information is retained. Static JPEG/PNG/WebP/GIF are accepted; animated GIF/WebP/APNG are explicitly rejected rather than silently flattened. Existing media is not rewritten or deleted. Read variants preserve animation and return original bytes when a smaller proportional derivative would grow; their MIME matches the bytes returned. Crop/focal/zoom coordinates and transparent contain rendering are independent of encoding.

The management editor uses the shared Squad BrandLogo and championship-red/black theme tokens. Incomplete legacy records without a usable billing owner and malformed membership identifiers fail closed without poisoning valid inventory choices. Unexpected server failures retain the generic private response; server diagnostics record only a bounded error code and operation, never credential/error-message payloads. Hosted inventory recovery still requires verified canary evidence.


New drafts start with an editable editorial page built around the selected entity's name, sport, public team logo, validated primaryColor/secondaryColor and explicitly publicDescription. Missing colours use an editable navy/gold palette; no colour is inferred from private images. No internal description, roster, membership, private hero/member image, contact details, results, achievements, sponsors or event claims are imported. Only an absent page record receives defaults; reads do not create or publish anything. Saved draft/live/previous revisions remain exact.

Locally hosted sports photographs have source, photographer, hash and reuse-license records in public/squad-pages/editorial/image-rights.json. They depict sporting atmosphere, not this entity's athletes or facilities. The editor identifies included editorial photography and asks for review before explicit publication. The gallery uses honest editorial headings, with no fake team moments. Empty contact/sponsor/link sections are hidden; only actual eligible registration forms and existing public resource destinations are connected. Every text, image, section and template remains editable/removable. Private uploaded-image ownership, paid coverage and exact-revision approval remain enforced. The public team logo uses one exact reserved ID. Its validated URL is captured in server-owned page metadata on the first explicit save, so subsequent team-logo changes cannot rewrite saved/live pages; existing records never adopt it automatically; no arbitrary URL can bypass owned media checks. Legacy sample IDs/rendering remain for saved drafts only, with their original review warning.

Image controls show only supported still-image formats and the 5 MB limit by default. Native expandable Image help retains pixel/resizing/transparency/animation guidance without repeating the long explanation beside every image. Actionable errors, coverage restrictions and approval requirements remain visible.
