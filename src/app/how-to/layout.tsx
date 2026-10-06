import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help and Operational Guide",
  description:
    "Step-by-step screenshot guides for coaches, parents, athletes, school and club leaders, competition organizers, officials and spectators.",
  alternates: { canonical: "/how-to" },
};

export default function HowToLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
