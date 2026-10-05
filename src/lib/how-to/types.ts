export type GuideRole =
  | "coach"
  | "staff"
  | "parent"
  | "player"
  | "youth"
  | "organization"
  | "school"
  | "organizer"
  | "official"
  | "visitor"
  | "platform";
export type GuideStep = {
  id: string;
  title: string;
  instruction: string;
  result: string;
  image: string;
  focus: string;
  note?: string;
  roles?: GuideRole[];
};
export type GuideChapter = {
  id: string;
  title: string;
  summary: string;
  roles: GuideRole[];
  feature: string;
  path: string;
  access: string;
  before: string;
  steps: GuideStep[];
};
export const GUIDE_ROLES: {
  id: GuideRole;
  title: string;
  description: string;
}[] = [
  {
    id: "coach",
    title: "Coach / team owner",
    description: "Create your squad and run a season.",
  },
  {
    id: "staff",
    title: "Assistant coach / staff",
    description: "Work with the permissions your team grants.",
  },
  {
    id: "parent",
    title: "Parent / guardian",
    description: "Manage children, schedules, waivers and fees.",
  },
  {
    id: "player",
    title: "Adult athlete",
    description: "Join a team and stay ready to play.",
  },
  {
    id: "youth",
    title: "Youth athlete",
    description: "Use the account your guardian invites you to.",
  },
  {
    id: "organization",
    title: "Club / organization leader",
    description: "Coordinate multiple squads and staff.",
  },
  {
    id: "school",
    title: "School / athletic director",
    description: "Manage school squads and shared requirements.",
  },
  {
    id: "organizer",
    title: "League / tournament organizer",
    description: "Run registration, scheduling and results.",
  },
  {
    id: "official",
    title: "Scorekeeper / referee",
    description: "Use the competition link from your organizer.",
  },
  {
    id: "visitor",
    title: "Spectator / community member",
    description: "Follow results, register, volunteer or donate.",
  },
  {
    id: "platform",
    title: "Platform administrator",
    description: "For authorized platform operators only.",
  },
];
