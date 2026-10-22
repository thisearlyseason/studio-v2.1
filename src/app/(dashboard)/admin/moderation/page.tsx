"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/firebase";
import { authHeader, getAuthToken } from "@/lib/client-auth";
import { Button } from "@/components/ui/button";
type Report = {
  id: string;
  teamId: string;
  kind: string;
  authorName: string;
  reason: string;
  details: string;
  contentPreview: string;
  hasImage: boolean;
  createdAt: string;
};
export default function ModerationPage() {
  const auth = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const request = useCallback(
    async (body?: Record<string, unknown>) => {
      const response = await fetch("/api/admin/moderation", {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(await getAuthToken(auth)),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      return data;
    },
    [auth],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request();
      setReports(data.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  async function resolve(id: string, action: string) {
    if (
      action === "remove" &&
      !window.confirm("Permanently remove this reported content?")
    )
      return;
    setBusy(id);
    setError("");
    try {
      await request({ reportId: id, action, note: notes[id] || "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Content moderation</h1>
      <p>
        Private platform moderation queue. Review pending reports promptly. Up
        to 100 pending reports are shown; refresh after resolving them.
      </p>
      <Button variant="outline" disabled={loading} onClick={() => void load()}>
        Refresh reports
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading reports…</p>
      ) : !error && !reports.length ? (
        <p>No pending reports.</p>
      ) : (
        reports.map((report) => (
          <section key={report.id} className="space-y-3 rounded-xl border p-4">
            <h2 className="font-semibold">{report.reason}</h2>
            <p className="text-sm">
              {report.kind} by {report.authorName} · {report.createdAt} · Team{" "}
              {report.teamId}
            </p>
            <blockquote className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">
              {report.contentPreview || "(No text)"}
            </blockquote>
            {report.hasImage && (
              <p>
                Image attached to original content. Inspect the original team
                content before deciding.
              </p>
            )}
            <p className="whitespace-pre-wrap break-words">{report.details}</p>
            <label className="block">
              Moderator note
              <textarea
                className="block w-full rounded border p-2"
                maxLength={2000}
                value={notes[report.id] || ""}
                onChange={(e) =>
                  setNotes({ ...notes, [report.id]: e.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy !== null || !notes[report.id]?.trim()}
                variant="destructive"
                onClick={() => void resolve(report.id, "remove")}
              >
                Remove content
              </Button>
              <Button
                disabled={busy !== null || !notes[report.id]?.trim()}
                variant="outline"
                onClick={() => void resolve(report.id, "dismiss")}
              >
                Dismiss report
              </Button>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
