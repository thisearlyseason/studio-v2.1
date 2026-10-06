import { GUIDE_CHAPTERS } from "./content";
import type { GuideRole } from "./types";

export type SelectedGuideRole = GuideRole | "all";
const startOrder: Partial<Record<GuideRole, string[]>> = {
  parent: [
    "account",
    "sign-in",
    "family-start",
    "join-squad",
    "youth-access",
    "waiver-member",
    "payments-family",
    "schedule-member",
  ],
  player: [
    "account",
    "sign-in",
    "join-squad",
    "athlete-day",
    "waiver-member",
    "payments-family",
    "schedule-member",
  ],
  youth: [
    "youth-access",
    "sign-in",
    "athlete-day",
    "schedule-member",
    "waiver-member",
  ],
  school: [
    "account",
    "sign-in",
    "organization",
    "school-staff",
    "global-waivers",
    "organization-finance",
    "create-squad",
  ],
  organization: [
    "account",
    "sign-in",
    "organization",
    "global-waivers",
    "organization-finance",
    "create-squad",
  ],
  organizer: [
    "account",
    "sign-in",
    "league-setup",
    "registration-builder",
    "league-schedule",
    "tournament-setup",
    "tournament-run",
  ],
  official: ["officials", "sign-in"],
  visitor: [
    "spectator",
    "public-registration",
    "volunteer-member",
    "donate",
    "sports-hub",
  ],
  platform: ["platform-admin", "sign-in"],
};

export function getGuideChapters(
  role: SelectedGuideRole,
  feature = "all",
  search = "",
) {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const order = role === "all" ? [] : startOrder[role] || [];
  return GUIDE_CHAPTERS.filter(
    (chapter) =>
      (role === "all" || chapter.roles.includes(role)) &&
      (feature === "all" || chapter.feature === feature),
  )
    .map((chapter) => {
      const chapterText =
        `${chapter.title} ${chapter.summary} ${chapter.feature} ${chapter.access}`.toLowerCase();
      return {
        ...chapter,
        steps: chapter.steps.filter(
          (step) =>
            (role === "all" || !step.roles || step.roles.includes(role)) &&
            words.every((word) =>
              `${chapterText} ${step.title} ${step.instruction} ${step.result} ${step.note || ""}`
                .toLowerCase()
                .includes(word),
            ),
        ),
      };
    })
    .filter((chapter) => chapter.steps.length)
    .sort((a, b) => {
      const rank = (id: string) =>
        order.includes(id) ? order.indexOf(id) : order.length;
      return rank(a.id) - rank(b.id);
    });
}
