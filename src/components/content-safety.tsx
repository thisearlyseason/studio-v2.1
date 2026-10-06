"use client";
import { useState } from "react";
import Link from "next/link";
import { collection } from "firebase/firestore";
import { MoreVertical } from "lucide-react";
import {
  useAuth,
  useFirestore,
  useCollection,
  useMemoFirebase,
} from "@/firebase";
import { useTeam } from "@/components/providers/team-provider";
import { authHeader, getAuthToken } from "@/lib/client-auth";
import { REPORT_REASONS, type SafetyTarget } from "@/lib/moderation-policy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

export function useBlockedAuthors() {
  const db = useFirestore();
  const auth = useAuth();
  const { user } = useTeam();
  const uid = auth.currentUser?.uid;
  const ref = useMemoFirebase(
    () =>
      db && uid && user ? collection(db, "userSafety", uid, "blocks") : null,
    [db, uid, user?.id],
  );
  const result = useCollection<{
    id: string;
    authorId: string;
    authorName: string;
  }>(ref);
  return {
    ...result,
    isLoading: result.isLoading || Boolean(result.error),
    isBlocked: (id: string | undefined) =>
      Boolean(id && result.data?.some((block) => block.authorId === id)),
  };
}
export function useSafetyAction() {
  const auth = useAuth();
  return async (body: Record<string, unknown>) => {
    const token = await getAuthToken(auth);
    if (!token) throw new Error("Please sign in again.");
    const response = await fetch("/api/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to save. Please try again.");
    return data;
  };
}
export function ContentSafety({
  target,
  authorId,
  authorName,
}: {
  target: SafetyTarget;
  authorId?: string;
  authorName: string;
}) {
  const { user } = useTeam();
  const auth = useAuth();
  const act = useSafetyAction();
  const [mode, setMode] = useState<"report" | "block" | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!authorId || authorId === auth.currentUser?.uid || authorId === user?.id)
    return null;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await act({ ...target, action: mode, reason, details });
      const reviewed = mode === "report" && result.status !== "pending";
      toast({
        title:
          mode === "report"
            ? reviewed
              ? "Report already reviewed"
              : "Report received"
            : "User blocked",
        description:
          mode === "report"
            ? reviewed
              ? "This version of the content has already been reviewed. You can still block this person."
              : "Your report is in the moderation queue. You can also block this person."
            : "Their posts, comments, and messages are hidden. You can unblock them in Blocked users.",
      });
      setMode(null);
      setDetails("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-11 w-11"
            aria-label={`Safety options for ${authorName}`}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setError("");
              setMode("report");
            }}
          >
            Report content
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setError("");
              setMode("block");
            }}
          >
            Block user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setMode(null);
        }}
      >
        <DialogContent className="h-auto max-h-[85dvh] w-[calc(100%-2rem)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 [&>div]:gap-4">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {mode === "report" ? "Report content" : `Block ${authorName}?`}
            </DialogTitle>
            <DialogDescription>
              {mode === "report"
                ? "Tell The Squad moderation team why this content needs review. Your report is not shown to the author. For immediate danger, contact local emergency services."
                : "Hide this person’s posts, comments, and messages across your teams. One-to-one chat messages and chat notifications between you will be blocked. Shared team membership stays unchanged."}
            </DialogDescription>
          </DialogHeader>
          {mode === "report" && (
            <div className="space-y-4">
              <label className="block text-sm font-medium">
                Reason
                <select
                  className="mt-2 w-full rounded-md border bg-background p-3"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {REPORT_REASONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Details (optional)
                <textarea
                  className="mt-2 w-full rounded-md border bg-background p-3"
                  rows={4}
                  maxLength={2000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {busy
                ? "Saving…"
                : mode === "report"
                  ? "Submit report"
                  : "Block user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function BlockedUsers() {
  const { data, isLoading, error: loadError } = useBlockedAuthors();
  const { isSuperAdmin } = useTeam();
  const act = useSafetyAction();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Blocked users
      </Button>
      {isSuperAdmin && (
        <Button asChild variant="outline">
          <Link href="/admin/moderation">Moderation queue</Link>
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-auto max-h-[85dvh] w-[calc(100%-2rem)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 [&>div]:gap-4">
          <DialogHeader className="pr-8">
            <DialogTitle>Blocked users</DialogTitle>
            <DialogDescription>
              Unblocking restores this person’s content and allows chat contact
              again.
            </DialogDescription>
          </DialogHeader>
          {loadError ? (
            <p role="alert">
              Unable to load blocked users. Please reload before continuing.
            </p>
          ) : isLoading ? (
            <p>Loading…</p>
          ) : !data?.length ? (
            <p>No blocked users.</p>
          ) : (
            data.map((block) => (
              <div
                key={block.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="wrap-break-word min-w-0">{block.authorName}</span>
                <Button
                  disabled={busy !== null}
                  variant="outline"
                  onClick={async () => {
                    setBusy(block.id);
                    setError("");
                    try {
                      await act({
                        action: "unblock",
                        authorId: block.authorId,
                      });
                      toast({ title: "User unblocked" });
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Please try again.",
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === block.id ? "Saving…" : "Unblock"}
                </Button>
              </div>
            ))
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
