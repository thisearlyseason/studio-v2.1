"use client";
import React, { Suspense, useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTeam } from "@/components/providers/team-provider";
import CompetitionController from "@/components/tournaments/CompetitionController";
function Builder() {
  const { activeTeam, firebaseUser, isStarter } = useTeam();
  const [openingHub, setOpeningHub] = useState(false);
  const search = useSearchParams(),
    router = useRouter();
  const token = useCallback(async () => {
    if (!firebaseUser) throw new Error("Sign in to manage tournaments.");
    return firebaseUser.getIdToken();
  }, [firebaseUser]);
  if (openingHub) return <p className="p-8" role="status">Opening your tournament…</p>;
  if (!activeTeam)
    return (
      <p className="p-8">
        Choose a host team to create or manage its tournaments.
      </p>
    );
  return (
    <div className="p-2 md:p-6">
      <CompetitionController
        startEditing={!!search.get("eventId")}
        starter={isStarter}
        teamId={activeTeam.id}
        eventId={search.get("eventId") || undefined}
        token={token}
        onSaved={(id) => {
          setOpeningHub(true);
          router.replace(
            `/manage-tournaments?eventId=${encodeURIComponent(id)}`,
          );
        }}
      />
    </div>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Builder />
    </Suspense>
  );
}
