"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Expand,
  Search,
  Printer,
  RotateCcw,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GUIDE_CHAPTERS } from "@/lib/how-to/content";
import {
  GUIDE_ROLES,
  type GuideRole,
  type GuideStep,
} from "@/lib/how-to/types";
import { getGuideChapters } from "@/lib/how-to/navigation";
import screenshots from "@/lib/how-to/screenshots.json";
import "./how-to.css";

const screenshotSizes = screenshots as Record<
  string,
  { width: number; height: number }
>;

const PROGRESS_KEY = "squad-how-to-progress-v1";
export default function HowToGuidePage() {
  const [role, setRole] = useState<GuideRole | "all">("all");
  const [feature, setFeature] = useState("all");
  const [search, setSearch] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [expanded, setExpanded] = useState<GuideStep | null>(null);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(PROGRESS_KEY) || "[]",
      );
      if (Array.isArray(saved))
        setCompleted(
          saved.filter((id): id is string => typeof id === "string"),
        );
    } catch {
      /* The guide works when browser storage is unavailable. */
    }
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("role");
    if (GUIDE_ROLES.some((item) => item.id === selected))
      setRole(selected as GuideRole);
    const query = params.get("q");
    if (query) setSearch(query);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(completed));
    } catch {
      /* Optional progress only. */
    }
  }, [completed, loaded]);
  const features = [
    ...new Set(
      GUIDE_CHAPTERS.filter(
        (chapter) => role === "all" || chapter.roles.includes(role),
      ).map((chapter) => chapter.feature),
    ),
  ];
  const chapters = useMemo(
    () => getGuideChapters(role, feature, search),
    [role, feature, search],
  );
  const total = chapters.reduce(
    (sum, chapter) => sum + chapter.steps.length,
    0,
  );
  const done = chapters.reduce(
    (sum, chapter) =>
      sum + chapter.steps.filter((step) => completed.includes(step.id)).length,
    0,
  );
  function selectRole(value: GuideRole | "all") {
    setRole(value);
    setFeature("all");
    const url = new URL(window.location.href);
    if (value === "all") url.searchParams.delete("role");
    else url.searchParams.set("role", value);
    window.history.replaceState(null, "", url);
  }
  async function printGuide() {
    setPreparingPrint(true);
    try {
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(".guide-image-button img"),
      );
      await Promise.allSettled(
        images.map((image) => {
          image.loading = "eager";
          return image.decode();
        }),
      );
      window.print();
    } finally {
      setPreparingPrint(false);
    }
  }
  return (
    <div className="how-to-guide">
      <a className="guide-skip" href="#guide-content">
        Skip to instructions
      </a>
      <header className="guide-header">
        <Link href="/" aria-label="The Squad home">
          <BrandLogo variant="light-background" className="h-9 w-28" />
        </Link>
        <nav aria-label="Guide links">
          <Link href="/dashboard">
            <ArrowLeft size={16} /> Open app
          </Link>
          <button onClick={printGuide} disabled={preparingPrint}>
            <Printer size={16} />{" "}
            {preparingPrint ? "Preparing…" : "Print guide"}
          </button>
        </nav>
      </header>
      <main>
        <section className="guide-hero">
          <div className="guide-eyebrow">
            <BookOpen size={16} /> THE SQUAD · FIELD GUIDE
          </div>
          <h1>
            Your season.
            <br />
            <span>Step by step.</span>
          </h1>
          <p>
            From your first sign-in to the final game. Choose your role, find a
            feature, and follow the instructions with a screenshot at every
            step.
          </p>
          <div className="guide-hero-meta">
            <span>{GUIDE_CHAPTERS.length} walkthroughs</span>
            <span>
              {GUIDE_CHAPTERS.reduce(
                (sum, chapter) => sum + chapter.steps.length,
                0,
              )}{" "}
              illustrated steps
            </span>
            <span>Web & mobile guidance</span>
          </div>
        </section>
        <section className="guide-controls" aria-label="Find your instructions">
          <div className="guide-control-heading">
            <span className="guide-kicker">01 / FIND YOUR PATH</span>
            <h2>How do you use The Squad?</h2>
            <p>
              Your role controls what you can manage. Your team’s plan and
              enabled modules control which features appear.
            </p>
          </div>
          <div className="guide-filters">
            <label>
              Your role
              <select
                value={role}
                onChange={(event) =>
                  selectRole(event.target.value as GuideRole | "all")
                }
              >
                <option value="all">All users and roles</option>
                {GUIDE_ROLES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feature
              <select
                value={feature}
                onChange={(event) => setFeature(event.target.value)}
              >
                <option value="all">All features, beginning to end</option>
                {features.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="guide-search">
              Search instructions
              <div>
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Try waivers, RSVP, add a child…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </label>
          </div>
          <div className="guide-getting-started">
            <strong>Start here</strong>
            <p>
              {role !== "all" && (
                <>
                  {
                    GUIDE_ROLES.find((item) => item.id === role)?.description
                  }{" "}
                </>
              )}
              Read each walkthrough in order. “Before you start” tells you what
              you need, and “You’re done when” explains how to check the result.
              Tap any screenshot to enlarge it. Screens show sample accounts;
              names and dates will differ from your team.
            </p>
          </div>
          <p className="guide-access-note">
            Missing a button? Check the selected squad, your team role, your
            plan and Settings → Module Visibility. Parents and athletes should
            ask their coach to enable a team feature. A paid plan does not grant
            staff permissions.
          </p>
        </section>
        <div className="guide-workspace">
          <aside className="guide-index">
            <details open>
              <summary>
                In this guide <ChevronDown size={16} />
              </summary>
              <nav aria-label="Walkthrough chapters">
                {chapters.map((chapter, index) => (
                  <a href={`#${chapter.id}`} key={chapter.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {chapter.title}
                  </a>
                ))}
              </nav>
            </details>
          </aside>
          <div id="guide-content" className="guide-content" tabIndex={-1}>
            <div className="guide-results">
              <p role="status" aria-live="polite">
                {chapters.length} walkthroughs · {total} steps
              </p>
              <div>
                <span>
                  {done} of {total} checked
                </span>
                {completed.length > 0 && (
                  <button
                    onClick={() => setCompleted([])}
                    aria-label="Reset checked guide steps"
                  >
                    <RotateCcw size={14} /> Reset
                  </button>
                )}
              </div>
            </div>
            {chapters.length === 0 && (
              <div className="guide-empty">
                <h2>No matching instructions</h2>
                <p>Try a shorter search, another feature, or all roles.</p>
                <button
                  onClick={() => {
                    setSearch("");
                    setFeature("all");
                    selectRole("all");
                  }}
                >
                  Show the complete guide
                </button>
              </div>
            )}
            {chapters.map((chapter, chapterIndex) => (
              <section
                className="guide-chapter"
                key={chapter.id}
                id={chapter.id}
                aria-labelledby={`${chapter.id}-title`}
              >
                <header className="guide-chapter-header">
                  <span className="guide-kicker">
                    {String(chapterIndex + 1).padStart(2, "0")} /{" "}
                    {chapter.feature}
                  </span>
                  <h2 id={`${chapter.id}-title`}>
                    <a href={`#${chapter.id}`}>{chapter.title}</a>
                  </h2>
                  <p>{chapter.summary}</p>
                  <div className="guide-access">
                    <span>{chapter.access}</span>
                    {chapter.path ? (
                      <Link
                        href={
                          chapter.id === "payments-family" && role === "player"
                            ? "/dashboard"
                            : chapter.path
                        }
                      >
                        Open feature <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <span>Use the link from your organizer or guardian</span>
                    )}
                  </div>
                  <p className="guide-before">
                    <strong>Before you start</strong> {chapter.before}
                  </p>
                </header>
                <ol className="guide-steps">
                  {chapter.steps.map((step) => {
                    const stepNumber =
                      GUIDE_CHAPTERS.find(
                        (item) => item.id === chapter.id,
                      )!.steps.findIndex((item) => item.id === step.id) + 1;
                    return (
                      <li key={step.id} id={step.id} className="guide-step">
                        <div className="guide-step-copy">
                          <div className="guide-step-heading">
                            <span className="guide-step-number">
                              {stepNumber}
                            </span>
                            <h3>
                              <a href={`#${step.id}`}>{step.title}</a>
                            </h3>
                          </div>
                          <p>{step.instruction}</p>
                          {step.note && (
                            <p className="guide-tip">
                              <strong>Good to know</strong> {step.note}
                            </p>
                          )}
                          <p className="guide-result">
                            <Check size={16} />
                            <span>
                              <strong>You’re done when</strong> {step.result}
                            </span>
                          </p>
                          <label className="guide-check">
                            <input
                              type="checkbox"
                              checked={completed.includes(step.id)}
                              onChange={() =>
                                setCompleted((current) =>
                                  current.includes(step.id)
                                    ? current.filter((id) => id !== step.id)
                                    : [...current, step.id],
                                )
                              }
                            />
                            Mark this step as read
                          </label>
                        </div>
                        <figure>
                          <button
                            className={`guide-image-button${screenshotSizes[step.image].height > screenshotSizes[step.image].width ? " is-portrait" : ""}`}
                            onClick={() => setExpanded(step)}
                            aria-label={`Enlarge screenshot: ${step.title}`}
                          >
                            <Image
                              src={`/how-to/screenshots/${step.image}.webp`}
                              alt={step.focus}
                              width={screenshotSizes[step.image].width}
                              height={screenshotSizes[step.image].height}
                              unoptimized
                              loading="lazy"
                            />
                            <span>
                              <Expand size={14} /> Enlarge screenshot
                            </span>
                          </button>
                          <figcaption>{step.focus}</figcaption>
                        </figure>
                      </li>
                    );
                  })}
                </ol>
                {chapters[chapterIndex + 1] && (
                  <a
                    className="guide-next"
                    href={`#${chapters[chapterIndex + 1].id}`}
                  >
                    Next: {chapters[chapterIndex + 1].title}
                    <ArrowRight size={16} />
                  </a>
                )}
              </section>
            ))}
            <footer className="guide-footer">
              <h2>Keep the guide beside you.</h2>
              <p>
                Open The Squad in another tab and follow along. Your checked
                steps stay in this browser. They do not change your account,
                submit forms or complete team requirements.
              </p>
              <p>
                Instructions reviewed against the current application, September
                2026. Screenshots use sample data. Available features depend on
                your permissions and plan.
              </p>
              <Link href="/dashboard">
                Return to The Squad <ArrowRight size={16} />
              </Link>
            </footer>
          </div>
        </div>
      </main>
      <Dialog
        open={!!expanded}
        onOpenChange={(open) => {
          if (!open) setExpanded(null);
        }}
      >
        <DialogContent className="guide-lightbox">
          <DialogTitle className="pr-10">{expanded?.title}</DialogTitle>
          <DialogDescription>{expanded?.focus}</DialogDescription>
          {expanded && (
            <div
              tabIndex={0}
              role="region"
              aria-label="Enlarged screenshot; scroll to inspect"
              className={`guide-lightbox-image${screenshotSizes[expanded.image].height > screenshotSizes[expanded.image].width ? " is-portrait" : ""}`}
            >
              <Image
                src={`/how-to/screenshots/${expanded.image}.webp`}
                alt={expanded.focus}
                onLoad={(event) => {
                  const panel = event.currentTarget.parentElement;
                  requestAnimationFrame(() => {
                    if (panel)
                      panel.scrollLeft = Math.max(
                        0,
                        (panel.scrollWidth - panel.clientWidth) / 2,
                      );
                  });
                }}
                width={screenshotSizes[expanded.image].width}
                height={screenshotSizes[expanded.image].height}
                unoptimized
              />
            </div>
          )}
          <p>
            Scroll across the image on a phone, or{" "}
            <a
              href={`/how-to/screenshots/${expanded?.image}.webp`}
              target="_blank"
              rel="noreferrer"
            >
              open the original screenshot
            </a>
            .
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
