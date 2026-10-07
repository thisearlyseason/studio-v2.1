"use client";
import { PasswordInput } from "@/components/ui/password-input";
import type { Resource } from "@/lib/competition/schedule";
import React, { useCallback, useEffect, useState } from "react";
import CompetitionWorkspace from "./CompetitionWorkspace";
import CompetitionSetup from "./CompetitionSetup";
import {
  createCompetition,
  type CompetitionDocument,
  type CompetitionSetup as Setup,
} from "@/lib/competition/document";
import { mutateCompetition } from "@/lib/competition/mutations";

type Props = {
  teamId?: string;
  eventId?: string;
  token?: () => Promise<string>;
  demo?: boolean;
  starter?: boolean;
  initialTab?: string;
  embedded?: boolean;
  startEditing?: boolean;
  initialDocument?: CompetitionDocument;
  publicView?: boolean;
  readOnly?: boolean;
  scorekeeperPortal?: boolean;
  onSaved?: (eventId: string) => void;
};
export default function CompetitionController({
  teamId,
  eventId: initialEventId,
  token,
  demo = false,
  starter = false,
  initialTab = "bracket",
  embedded = false,
  startEditing = false,
  initialDocument,
  publicView = false,
  readOnly = false,
  scorekeeperPortal = false,
  onSaved,
}: Props) {
  const [catalog, setCatalog] = useState<{
    teams: { id: string; name: string }[];
    resources: Resource[];
  }>({ teams: [], resources: [] });
  const [doc, setDoc] = useState<CompetitionDocument | null>(
      initialDocument || null,
    ),
    [eventId, setEventId] = useState(initialEventId || ""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!initialEventId),
    [edit, setEdit] = useState(startEditing),
    [credentialVersion, setCredentialVersion] = useState(0),
    [lifecycleVersion, setLifecycleVersion] = useState(0),
    [code, setCode] = useState(""),
    [scoreAccess, setScoreAccess] = useState(false),
    [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!token || !teamId || demo || publicView) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/tournaments/competition?catalog=true&teamId=${encodeURIComponent(teamId)}`,
          { headers: { Authorization: `Bearer ${await token()}` } },
        );
        if (response.ok && !cancelled) setCatalog(await response.json());
      } catch {
        /* Existing resources remain optional until the request is retried. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, teamId, demo, publicView]);
  const refresh = useCallback(async () => {
    if (!eventId || demo) return;
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${await token()}`;
      const response = await fetch(
        `/api/tournaments/competition?teamId=${encodeURIComponent(teamId || "")}&eventId=${encodeURIComponent(eventId)}${publicView ? "&public=true" : ""}`,
        { headers, cache: "no-store" },
      );
      const data = await response.json().catch(() => { throw new Error("The server could not complete this request. Please check the tournament status and try again."); });
      if (!response.ok)
        throw new Error(data.error || "Unable to load tournament.");
      setDoc(data.competition);
      setCredentialVersion(data.credentialVersion);
      setLifecycleVersion(data.lifecycleVersion);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      setLoading(false);
    }
  }, [eventId, teamId, token, demo, publicView]);
  useEffect(() => {
    void refresh();
    if (!eventId || demo) return;
    const interval = setInterval(() => void refresh(), 15000);
    return () => clearInterval(interval);
  }, [refresh, eventId, demo]);
  async function command(
    action: string,
    payload: Record<string, unknown> = {},
  ) {
    if (demo) {
      if (action === "create") setDoc(createCompetition(payload.setup));
      else setDoc(mutateCompetition(doc!, action, payload));
      setEdit(false);
      return;
    }
    if (!teamId) throw new Error("Choose a host team first.");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${await token()}`;
    const response = await fetch("/api/tournaments/competition", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action,
        teamId,
        eventId,
        requestId: crypto.randomUUID(),
        revision: doc?.revision || 0,
        payload,
        ...(publicView && action === "score"
          ? { code, credentialVersion }
          : {}),
      }),
    });
    const data = await response.json().catch(() => { throw new Error("The server could not complete this request. Please check the tournament status and try again."); });
    if (!response.ok)
      throw new Error(
        [
          data.error,
          ...(data.conflicts || [])
            .slice(0, 4)
            .map((c: { message: string }) => c.message),
        ].join(" "),
      );
    setDoc(data.competition);
    setEventId(data.eventId);
    setLifecycleVersion(data.lifecycleVersion);
    setEdit(false);
    onSaved?.(data.eventId);
  }
  async function credential(revoke: boolean) {
    if (!token || !eventId) throw new Error("Save this tournament first.");
    const generated = Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
    ).join("");
    const response = await fetch("/api/tournaments/credential", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        teamId,
        eventId,
        scoringCode: generated,
        revoke,
        expectedLifecycleVersion: lifecycleVersion,
        expectedCredentialVersion: credentialVersion,
      }),
    });
    const data = await response.json().catch(() => { throw new Error("The server could not complete this request. Please check the tournament status and try again."); });
    if (!response.ok) throw new Error(data.error);
    setCredentialVersion(data.credentialVersion);
    return revoke ? undefined : generated;
  }
  if (loading)
    return (
      <p className="p-8" role="status">
        Loading tournament…
      </p>
    );
  if (publicView && !doc)
    return (
      <div className="cw">
        <h1>Tournament unavailable</h1>
        <p role="alert">{error}</p>
        <button onClick={() => void refresh()}>Retry</button>
      </div>
    );
  return (
    <div>
      {demo && (
        <div className="cw-banner p-4 text-center">
          Local preview — sample data only. No account data or real bookings are
          changed.
        </div>
      )}
      {error && (
        <p role="alert" className="cw-error p-4">
          {error}
        </p>
      )}
      {!doc || edit ? (
        <CompetitionSetup
          catalog={
            demo
              ? {
                  teams: initialDocument?.topology.teams || [],
                  resources: initialDocument?.options.resources || [
                    {
                      id: "preview_north:Court 1",
                      name: "North Arena — Court 1",
                      venueId: "preview_north",
                      venueName: "North Arena",
                      surfaceName: "Court 1",
                    },
                    {
                      id: "preview_south:Court 1",
                      name: "South Sports Center — Court 1",
                      venueId: "preview_south",
                      venueName: "South Sports Center",
                      surfaceName: "Court 1",
                    },
                  ],
                }
              : catalog
          }
          starter={starter}
          demo={demo}
          initial={doc || undefined}
          onCreate={async (setup: Setup) =>
            command(doc ? "configure" : "create", { setup })
          }
        />
      ) : (
        <>
          {!publicView && (
            <div className="px-4 py-3 flex gap-3">
              {!embedded && (
                <a
                  href={
                    eventId
                      ? `/manage-tournaments?eventId=${encodeURIComponent(eventId)}`
                      : "/manage-tournaments"
                  }
                >
                  ← Tournament hub
                </a>
              )}
              <button
                disabled={doc.status === "published" || doc.results.length > 0}
                onClick={() => setEdit(true)}
              >
                Edit setup
              </button>
            </div>
          )}
          {publicView && !readOnly && (
            <details className="cw cw-access p-3" open={scorekeeperPortal || undefined}>
              <summary>Scorekeeper access</summary>
              <label>
                Scoring code
                <PasswordInput
                  
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button disabled={!code.trim()} onClick={async () => {
                setError("");
                try {
                  const response = await fetch('/api/public/portals/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'tournament',action:'verify',teamId,eventId,code:code.trim()})});
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || 'Invalid scorekeeper code.');
                  setCode(code.trim()); setScoreAccess(true);
                } catch (err) { setScoreAccess(false); setError(err instanceof Error ? err.message : 'Unable to verify code.'); }
              }}>
                Enable score entry
              </button>
              <p>
                {scoreAccess ? "Score entry enabled. Choose a game in Pools, Bracket, or Schedule to record its result." : "Enter the code supplied by your tournament organizer to unlock scoring."}
              </p>
            </details>
          )}
          <CompetitionWorkspace
            initialTab={initialTab}
            registrationUrl={!publicView && !starter && teamId && eventId ? `/manage-tournaments/registration/${teamId}/${eventId}` : undefined}
            document={doc}
            onAction={!publicView || scoreAccess ? command : undefined}
            canScore={publicView && scoreAccess}
            demo={demo}
            publicUrl={
              eventId
                ? `${origin}/tournaments/live/${teamId}/${eventId}`
                : undefined
            }
            embedUrl={
              eventId
                ? `${origin}/embed/tournament/${teamId}/${eventId}`
                : undefined
            }
            onCredential={!demo && !publicView ? credential : undefined}
          />
        </>
      )}
    </div>
  );
}
