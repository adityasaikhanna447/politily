"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState, SignalSource, StoredStory } from "../lib/types";
import { getDemoState } from "../lib/demo-data";

type View = "signals" | "brief" | "sources" | "setup";

export function PolitilyDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [view, setView] = useState<View>("signals");
  const [status, setStatus] = useState("Connecting to Politily");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");

  useEffect(() => {
    void refreshState();
  }, []);

  async function refreshState() {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const next = (await response.json()) as DashboardState;
      setState(next);
      setSelectedId((current) => current || storyFromUrl() || next.stories[0]?.id || "");
      setStatus(next.demoMode ? "Demo mode: connect storage to persist live signals" : "Live monitor ready");
    } catch (error) {
      const fallback = getDemoState();
      setState(fallback);
      setSelectedId(fallback.stories[0]?.id || "");
      setStatus(error instanceof Error ? `Demo mode: ${error.message}` : "Demo mode loaded");
    }
  }

  async function runScan() {
    setBusy(true);
    setStatus("Scanning sources and scoring signals");
    try {
      const response = await fetch("/api/scan", { method: "POST" });
      const payload = (await response.json()) as { state?: DashboardState; error?: string };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setState(payload.state);
      setSelectedId((current) => current || payload.state?.stories[0]?.id || "");
      setStatus("Scan complete");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateBrief(storyId: string) {
    setBusy(true);
    setStatus("Generating Politily brief with Gemini");
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const payload = (await response.json()) as { state?: DashboardState; error?: string };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setState(payload.state);
      setSelectedId(storyId);
      setView("brief");
      setStatus("Brief ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Brief generation failed");
    } finally {
      setBusy(false);
    }
  }

  const stories = state?.stories ?? [];
  const filteredStories = useMemo(
    () =>
      stories.filter((story) => {
        const haystack = `${story.title} ${story.summary} ${story.sourceName} ${story.tags.join(" ")}`.toLowerCase();
        const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
        const matchesScope =
          scope === "all" ||
          story.tags.includes(scope) ||
          story.sourceCountry.toLowerCase().includes(scope) ||
          story.sourceName.toLowerCase().includes(scope);
        return matchesQuery && matchesScope;
      }),
    [stories, query, scope]
  );
  const selectedStory = useMemo(
    () => filteredStories.find((story) => story.id === selectedId) ?? filteredStories[0] ?? stories[0],
    [filteredStories, stories, selectedId]
  );
  const triggeredCount = stories.filter((story) => story.totalScore >= (state?.config.threshold ?? 72)).length;
  const latestRun = state?.runs[0];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col lg:flex-row">
        <aside className="border-b border-[var(--line)] bg-[var(--panel)] px-5 py-5 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">Open source monitor</p>
              <h1 className="mt-1 text-2xl font-black tracking-normal">Politily</h1>
            </div>
            <div className="rounded-md border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)] lg:mt-5">
              24h political desk
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-auto lg:flex-col">
            <Tab label="Signals" value="signals" active={view} onClick={setView} />
            <Tab label="Brief" value="brief" active={view} onClick={setView} />
            <Tab label="Sources" value="sources" active={view} onClick={setView} />
            <Tab label="Setup" value="setup" active={view} onClick={setView} />
          </nav>

          <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <Metric label="Threshold" value={`${state?.config.threshold ?? 72}`} tone="gold" />
            <Metric label="Triggered" value={`${triggeredCount}`} tone="red" />
            <Metric label="Gemini" value={state?.config.geminiReady ? "Ready" : "Missing"} tone="green" />
            <Metric label="Email" value={state?.config.emailReady ? "Ready" : "Setup"} tone="blue" />
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--muted)]">{status}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-normal">
                  Newsroom war room for political evidence
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  onClick={runScan}
                  type="button"
                >
                  {busy ? "Working" : "Run scan"}
                </button>
                <button
                  className="rounded-md border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2 text-sm font-semibold"
                  disabled={busy}
                  onClick={refreshState}
                  type="button"
                >
                  Refresh
                </button>
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.08fr)]">
            <section className="min-h-[420px] border-b border-[var(--line)] bg-[var(--panel-strong)] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                <div>
                  <h3 className="text-base font-bold">Live story queue</h3>
                  <p className="text-sm text-[var(--muted)]">
                    {latestRun
                      ? `${latestRun.scannedCount} scanned, ${latestRun.createdCount} new, ${latestRun.triggeredCount} triggered`
                      : "Waiting for first scan"}
                  </p>
                </div>
                {state?.demoMode ? <Badge label="Demo" tone="gold" /> : <Badge label="Live" tone="green" />}
              </div>
              <div className="grid gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3 sm:grid-cols-[1fr_148px]">
                <input
                  className="h-10 rounded-md border border-[var(--line)] bg-[var(--background)] px-3 text-sm outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search issue, party, state, person, institution"
                  value={query}
                />
                <select
                  className="h-10 rounded-md border border-[var(--line)] bg-[var(--background)] px-3 text-sm font-semibold outline-none"
                  onChange={(event) => setScope(event.target.value)}
                  value={scope}
                >
                  <option value="all">All desks</option>
                  <option value="india">India</option>
                  <option value="election">Election</option>
                  <option value="courts">Courts</option>
                  <option value="geopolitics">Geopolitics</option>
                  <option value="party-politics">Party</option>
                  <option value="public-order">Public order</option>
                </select>
              </div>
              <div className="no-scrollbar max-h-[calc(100vh-194px)] overflow-auto p-4">
                {filteredStories.map((story) => (
                  <StoryRow
                    active={selectedStory?.id === story.id}
                    key={story.id}
                    onClick={() => {
                      setSelectedId(story.id);
                      if (view === "sources" || view === "setup") {
                        setView("signals");
                      }
                    }}
                    story={story}
                  />
                ))}
                {filteredStories.length === 0 ? (
                  <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
                    No signals match this desk filter yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="min-w-0 bg-[var(--background)]">
              {view === "signals" && selectedStory ? (
                <SignalDetail busy={busy} onGenerate={generateBrief} story={selectedStory} />
              ) : null}
              {view === "brief" && selectedStory ? (
                <BriefDetail busy={busy} onGenerate={generateBrief} story={selectedStory} />
              ) : null}
              {view === "sources" && state ? <SourceLibrary state={state} /> : null}
              {view === "setup" && state ? <SetupPanel state={state} /> : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Tab({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: View;
  active: View;
  onClick: (value: View) => void;
}) {
  const isActive = value === active;
  return (
    <button
      className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${
        isActive ? "bg-[var(--ink)] text-white" : "bg-transparent text-[var(--muted)] hover:bg-[var(--panel-strong)]"
      }`}
      onClick={() => onClick(value)}
      type="button"
    >
      {label}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "red" | "green" | "gold" | "blue" }) {
  const toneMap = {
    red: "text-[var(--red)]",
    green: "text-[var(--green)]",
    gold: "text-[var(--gold)]",
    blue: "text-[var(--blue)]",
  };

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-xl font-black ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}

function StoryRow({
  story,
  active,
  onClick,
}: {
  story: StoredStory;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`mb-3 w-full rounded-md border p-4 text-left transition ${
        active
          ? "border-[var(--ink)] bg-[var(--panel)] shadow-sm"
          : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--gold)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="line-clamp-2 text-sm font-bold leading-5">{story.title}</h4>
        <span className="shrink-0 rounded-md bg-[var(--ink)] px-2 py-1 text-xs font-bold text-white">
          {story.totalScore}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{story.summary || story.sourceName}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge label={story.status} tone={story.status === "watching" ? "blue" : "red"} />
        <span className="text-xs text-[var(--muted)]">{story.sourceName}</span>
      </div>
    </button>
  );
}

function SignalDetail({
  story,
  busy,
  onGenerate,
}: {
  story: StoredStory;
  busy: boolean;
  onGenerate: (storyId: string) => void;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Selected signal</p>
          <h3 className="mt-1 max-w-3xl text-2xl font-black leading-tight tracking-normal">{story.title}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{story.summary}</p>
        </div>
        <button
          className="rounded-md bg-[var(--green)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={() => onGenerate(story.id)}
          type="button"
        >
          {story.brief ? "Refresh brief" : "Generate brief"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ScoreBlock label="Novelty" value={story.noveltyScore} />
        <ScoreBlock label="Political weight" value={story.politicalWeight} />
        <ScoreBlock label="Geopolitical relevance" value={story.geopoliticalRelevance} />
        <ScoreBlock label="Viral potential" value={story.viralPotential} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ResearchCard label="Evidence posture" value={story.brief?.evidenceGrade ?? "Needs brief"} />
        <ResearchCard label="Primary trail" value={story.sourceType === "official" || story.sourceType === "html" ? "Official source" : "Needs primary docs"} />
        <ResearchCard label="Source links" value={`${story.sourceLinks?.length ?? 0} attached`} />
      </div>

      <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Signal tags</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {story.tags.map((tag) => (
            <Badge key={tag} label={tag} tone="gold" />
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Primary reference</h4>
        <a className="mt-2 block break-words text-sm font-semibold text-[var(--blue)]" href={story.url} rel="noreferrer" target="_blank">
          {story.url}
        </a>
      </div>

      <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Verification queue</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
          <li>Find the official order, court record, party statement, or government release behind this signal.</li>
          <li>Compare agency/media reporting with at least one counter-position.</li>
          <li>Use regional sources for local history before calling anything propaganda, censorship, or public-order risk.</li>
        </ul>
      </div>
    </div>
  );
}

function BriefDetail({
  story,
  busy,
  onGenerate,
}: {
  story: StoredStory;
  busy: boolean;
  onGenerate: (storyId: string) => void;
}) {
  const brief = story.brief;
  if (!brief) {
    return (
      <div className="p-5">
        <h3 className="text-2xl font-black">No deep brief yet</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          This story is scored and ready for research. Generate a brief to create context, source confidence, and a script.
        </p>
        <button
          className="mt-5 rounded-md bg-[var(--green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => onGenerate(story.id)}
          type="button"
        >
          Generate brief
        </button>
      </div>
    );
  }

  return (
    <div className="no-scrollbar max-h-[calc(100vh-122px)] overflow-auto p-5">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">
        {brief.generatedBy === "gemini" ? "Gemini brief" : "Template brief"} generated {formatDate(brief.generatedAt)}
      </p>
      <h3 className="mt-1 text-2xl font-black leading-tight tracking-normal">{brief.briefTitle}</h3>
      <p className="mt-3 max-w-3xl text-lg font-semibold leading-7 text-[var(--red)]">{brief.hook}</p>

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <ResearchCard label="Evidence grade" value={brief.evidenceGrade} />
        <ResearchCard label="Timeline items" value={`${brief.timeline?.length ?? 0}`} />
        <ResearchCard label="Claims to check" value={`${brief.claimMatrix?.length ?? 0}`} />
        <ResearchCard label="Missing evidence" value={`${brief.missingEvidence?.length ?? 0}`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TextPanel title="What happened" text={brief.whatHappened} />
        <TextPanel title="Why it matters" text={brief.whyItMatters} />
        <TextPanel title="Historical context" text={brief.historicalContext} />
        <TextPanel title="Geographical context" text={brief.geographicalContext} />
        <TextPanel title="Regional context" text={brief.regionalContext || "No regional context generated yet."} />
      </div>

      <ListPanel title="Facts and figures" items={brief.factsAndFigures} />
      <ListPanel title="Timeline" items={brief.timeline ?? []} />
      <ListPanel title="Claim matrix" items={brief.claimMatrix ?? []} />
      <ListPanel title="Primary documents to obtain" items={brief.primaryDocuments ?? []} />
      <ListPanel title="Missing evidence" items={brief.missingEvidence ?? []} />
      <ListPanel title="Verification protocol" items={brief.verificationProtocol ?? []} />
      <ListPanel title="Multiple narratives" items={brief.narratives} />
      <ListPanel title="What happens next" items={brief.whatHappensNext} />

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Creator script</h4>
        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--panel-strong)] p-4 text-sm leading-6 text-[var(--ink)]">
          {brief.videoScript}
        </pre>
      </div>

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Sources</h4>
        <div className="mt-3 space-y-2">
          {brief.citedUrls.map((url) => (
            <a className="block break-words text-sm font-semibold text-[var(--blue)]" href={url} key={url} rel="noreferrer" target="_blank">
              {url}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Publishing caution</h4>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{brief.caution}</p>
      </div>
    </div>
  );
}

function SourceLibrary({ state }: { state: DashboardState }) {
  const grouped = groupSources(state.sources);

  return (
    <div className="p-5">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">Source library</p>
      <h3 className="mt-1 text-2xl font-black">Source hierarchy and reliability desk</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
        Politily should treat official records as the first layer, agencies and national media as triangulation,
        regional reporting as context, and fact-check/legal sources as verification. No single source is truth by default.
      </p>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ResearchCard label="Active sources" value={`${state.sources.filter((source) => source.active).length}`} />
        <ResearchCard label="Primary layer" value={`${state.sources.filter((source) => source.category.toLowerCase().includes("primary")).length}`} />
        <ResearchCard label="Last scan runs" value={`${state.runs.length}`} />
      </div>

      <div className="mt-5 space-y-5">
        {grouped.map(([category, sources]) => (
          <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]" key={category}>
            <div className="border-b border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{category}</p>
            </div>
            {sources.map((source) => (
              <div className="grid gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_110px_92px_90px]" key={source.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{source.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{source.url}</p>
                </div>
                <span className="text-sm font-semibold text-[var(--muted)]">{source.region}</span>
                <span className="text-sm text-[var(--muted)]">{source.type.toUpperCase()}</span>
                <Badge label={source.active ? "Active" : "Paused"} tone={source.active ? "green" : "gold"} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupPanel({ state }: { state: DashboardState }) {
  const rows = [
    ["GEMINI_API_KEY", state.config.geminiReady ? "Ready" : "Needed for deep research"],
    ["RESEND_API_KEY", state.config.emailReady ? "Ready" : "Needed for email alerts"],
    ["ALERT_EMAIL", state.config.emailReady ? "Ready" : "Destination inbox"],
    ["ALERT_FROM_EMAIL", state.config.emailReady ? "Ready" : "Verified sender"],
    ["POLITILY_SCORE_THRESHOLD", `${state.config.threshold}`],
  ];

  return (
    <div className="p-5">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">Production setup</p>
      <h3 className="mt-1 text-2xl font-black">Keys, storage, and schedule</h3>
      <div className="mt-5 grid gap-3">
        {rows.map(([key, value]) => (
          <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4" key={key}>
            <p className="font-mono text-sm font-bold">{key}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Runtime path</h4>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Cloudflare Worker cron runs the scanner, D1 stores seen stories, Gemini creates research briefs, and Resend sends alerts.
        </p>
      </div>
      <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
        <h4 className="text-sm font-bold">Research standard</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
          <li>Primary documents first: orders, filings, court records, official statements, data releases.</li>
          <li>Agency and national media second: useful for triangulation, never automatic truth.</li>
          <li>Regional context third: history, local language reporting, state politics, community tensions.</li>
          <li>Publish only after the claim matrix separates facts, allegations, spin, and missing evidence.</li>
        </ul>
      </div>
    </div>
  );
}

function ScoreBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold">{label}</h4>
        <span className="font-black">{value}</span>
      </div>
      <div className="score-meter mt-3 h-2 overflow-hidden rounded-full">
        <div className="h-full bg-[var(--ink)]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ResearchCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-words text-lg font-black text-[var(--ink)]">{value}</p>
    </div>
  );
}

function TextPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <h4 className="text-sm font-bold">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <h4 className="text-sm font-bold">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
        {items.map((item) => (
          <li className="border-l-2 border-[var(--gold)] pl-3" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupSources(sources: SignalSource[]): Array<[string, SignalSource[]]> {
  const groups = new Map<string, SignalSource[]>();
  sources.forEach((source) => {
    const key = source.category || "Other";
    const list = groups.get(key) ?? [];
    list.push(source);
    groups.set(key, list);
  });

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function Badge({ label, tone }: { label: string; tone: "red" | "green" | "gold" | "blue" }) {
  const toneMap = {
    red: "border-[var(--red)] text-[var(--red)]",
    green: "border-[var(--green)] text-[var(--green)]",
    gold: "border-[var(--gold)] text-[var(--gold)]",
    blue: "border-[var(--blue)] text-[var(--blue)]",
  };

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${toneMap[tone]}`}>
      {label}
    </span>
  );
}

function storyFromUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("story") ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
