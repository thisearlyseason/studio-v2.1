# Squad Pro Demo Workflow Evidence

Role: anonymous demo coach/staff. Browser: Chromium.

The demo seeded successfully and opened Dashboard, Roster, Team Chat, Practice, Games, Feed, Files, Facilities, and Equipment without console errors or unexpected 4xx/5xx responses. Those route smokes do not by themselves satisfy the full matrix rows.

The Events workflow received deeper testing:

1. Opened Schedule and toggled List to Calendar.
2. Opened New Activity.
3. Submitted empty required fields and received the handled `Activity Incomplete` message without a network mutation.
4. Entered a valid title, date, and time and deployed the event.
5. Confirmed `POST /api/teams/events/action` returned 200.
6. Reloaded and confirmed the new event persisted.
7. Opened event detail and clicked its destructive delete button once.
8. The event disappeared immediately without a confirmation/cancel step, reproducing BUG-001.

Console errors: 0. One expected browser warning came from deliberately entering an invalid HTML time value and is excluded from the application error count. Unexpected network failures: 0.

Artifacts: `output/playwright/2026-08-21T232919Z/root-demo/`.

