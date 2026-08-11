# FAQ Tutorials - 2026-08-10

## How to Create a Game

**Purpose:** Add a game to your squad schedule so participants can see its time, opponent, and location.

**User role:** Coach or authorized squad staff

1. Open **Schedule** from the squad navigation.
2. Open the new activity form.
3. Select **Game** as the activity type.
4. Enter the game title, date, start time, opponent, and location.
5. Add logistics assignments if needed.
6. Save the activity.
7. Open the new game and confirm its details.

**Expected result:** The game appears in the schedule, remains after refresh, and can be edited or deleted by authorized staff.

**Recording:** `output/playwright/qa-2026-08-10/recordings/FAQ-Coach-Create-Game.mp4`

**Related features:** Create a practice; create a meeting; edit an activity; enter a score.

## How to Review Your Family Hub

**Purpose:** Review each child's team, schedule, waivers, and the combined family balance.

**User role:** Parent or guardian

1. Open **Family** from the navigation.
2. Review **Pending Waivers**; each item identifies the child and team it belongs to.
3. Review **Your Teams** to confirm each child's memberships.
4. Review **Family Payments** for the combined outstanding balance.
5. Scroll to **Family Schedule** to compare each child's upcoming events.
6. Use the player cards to review or edit a specific child.

**Expected result:** Each child has a separate schedule and waiver list; information is labeled with the correct child and team.

**Screenshot:** `output/playwright/qa-2026-08-10/screenshots/FAQ-Parent-Family-Hub-Mobile.png`

**Recording:** Needs Recording. Start at `/family` with a parent account containing two children.

## How to Sign a Child's Waiver

**Purpose:** Electronically sign one assigned waiver for the correct child.

**User role:** Parent or guardian

1. Open **Family**.
2. In **Pending Waivers**, locate the document labeled with the intended child's name and team.
3. Select **Review & Sign**.
4. Read the full waiver and confirm the child named in the signature notice.
5. Enter your full legal name.
6. Select **Confirm Signature**.

**Expected result:** That waiver leaves the pending list, the signed-waiver total increases, and sibling waivers remain unchanged.

**Recording:** Needs Recording. Start at `/family`; use separate QA children and no real personal information.

## How to Use the Player Dashboard

**Purpose:** Find a player's schedule, chat, practice resources, profile, and team opportunities.

**User role:** Athlete/player

1. Open **Dashboard**.
2. Use **Next Actions** for schedule, chat, practice, or profile.
3. Review the upcoming schedule and team opportunities.
4. Open waiver documents before game day when compliance is pending.

**Expected result:** Player tools are visible, while coach and administrator controls are absent or denied by direct URL.

**Screenshot:** `output/playwright/qa-2026-08-10/screenshots/FAQ-Player-Dashboard-Tablet.png`

**Recording:** Needs Recording. Start at `/dashboard` as a player.

## How to Create a League

**Purpose:** Create a competition hub with a sport and optional division.

**User role:** League Organizer

1. Open **Competition Hub** and select **Leagues**.
2. Select **Create League**.
3. Enter the league title and sport.
4. Enter a division and press Enter, or select **Add**.
5. Select **Deploy Hub**.

**Expected result:** The league appears beside the seeded showcase, remains after refresh, and can be selected for management. A Free demo allows one created league and then shows **League Limit Reached**.

**Screenshot:** `output/playwright/qa-2026-08-10/screenshots/League-Created-Retest.png`

**Recording:** Needs Recording. Start at `/competition` in a fresh Free League Creator demo.

## How to Edit a League

**Purpose:** Update an owned league's identity and registration URL.

**User role:** League Organizer

1. Open **Competition Hub** and select the league division.
2. Select **Edit league**.
3. Update the league name, registration slug, or other profile details.
4. Select **Commit League Profile**.
5. Refresh Competition Hub and reopen the league.

**Expected result:** The updated name and registration slug remain after refresh, and organizer controls stay available.

**Screenshot:** `output/playwright/qa-2026-08-10/screenshots/League-Created-Retest.png`

**Recording:** Needs Recording. Start from the selected league in `/competition`.
