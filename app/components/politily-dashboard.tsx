"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState, SignalSource, StoredStory } from "../lib/types";
import { getDemoState } from "../lib/demo-data";

type View = "signals" | "brief" | "sources" | "setup";

const SCRIPT_STAGES = [
  ["Hook", "0:00-1:30", "One sharp contradiction, fact, or question that makes the viewer stop scrolling."],
  ["Context", "1:30-3:30", "What happened, who acted, what changed, and what the official record says."],
  ["History", "3:30-6:00", "The background: earlier tensions, legal/political memory, and regional context."],
  ["Data", "6:00-8:00", "Numbers, documents, maps, timelines, court orders, and institutional evidence."],
  ["Angles", "8:00-12:00", "Government position, critic/opposition view, affected people, expert/international view."],
  ["What Next", "12:00-14:30", "Concrete scenarios and what signals to watch before publishing a strong claim."],
  ["Close", "14:30-16:00", "An uncomfortable but fair question that invites comments without becoming propaganda."],
];

const TOPIC_CLUSTERS = [
  "Indian elections",
  "Parliament",
  "Courts",
  "Censorship",
  "Punjab",
  "Kashmir",
  "Foreign policy",
  "India-China",
  "India-Pakistan",
  "Public order",
  "Political funding",
  "Fact-checks",
];

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
  const activeSources = state?.sources.filter((source) => source.active).length ?? 0;
  const briefedCount = stories.filter((story) => story.brief).length;
  const watchingCount = stories.filter((story) => story.status === "watching").length;
  const tickerStories = stories.slice(0, 6);
  const latestRunText = latestRun
    ? `${latestRun.status.toUpperCase()} / ${latestRun.scannedCount} scanned / ${latestRun.createdCount} new / ${latestRun.triggeredCount} triggered`
    : "Waiting for first scan";
  const latestRunMessage = latestRun?.message || "No warnings in the latest scan.";
  const lastRunTime = latestRun?.finishedAt || latestRun?.startedAt || state?.generatedAt;

  return (
    <main className="app-shell min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto min-h-screen w-full max-w-[1760px]">
        <header className="masthead">
          <div className="masthead-kicker">
            <span>Research desk</span>
            <strong>{state?.demoMode ? "Demo feed" : "Live open-source monitor"}</strong>
          </div>
          <div className="masthead-center">
            <h1>
              Politi<span>ly</span>
            </h1>
            <p>Political evidence war room for creator research</p>
          </div>
          <div className="masthead-status">
            <span>{status}</span>
            <strong>{state?.generatedAt ? `${formatDate(state.generatedAt)} IST` : "Connecting"}</strong>
          </div>
        </header>

        <section className="ticker-strip" aria-label="Live intelligence ticker">
          <div className="ticker-label">Signal wire</div>
          <div className="ticker-copy">
            {tickerStories.length
              ? tickerStories.map((story) => `${story.totalScore} ${story.title}`).join(" / ")
              : "Waiting for first political signal"}
          </div>
        </section>

        <section className="ops-ribbon" aria-label="Production readiness">
          <OpsCard label="Storage" value={state?.config.storageReady ? "D1 ready" : "Missing"} tone={state?.config.storageReady ? "blue" : "red"} />
          <OpsCard label="Gemini" value={state?.config.geminiReady ? "Research ready" : "Missing"} tone={state?.config.geminiReady ? "blue" : "red"} />
          <OpsCard label="Email" value={state?.config.emailReady ? "Alerts ready" : "DNS/API pending"} tone={state?.config.emailReady ? "blue" : "red"} />
          <OpsCard label="Latest run" value={latestRun ? `${latestRun.status} / ${latestRun.createdCount} new` : "Waiting"} tone={latestRun?.status === "failed" ? "red" : "blue"} />
          <OpsCard label="Briefs" value={`${briefedCount}/${stories.length || 0}`} tone="blue" />
        </section>

        <div className="workspace-grid grid min-h-[calc(100vh-190px)] xl:grid-cols-[300px_minmax(410px,0.9fr)_minmax(620px,1.15fr)]">
          <aside className="command-rail">
            <div className="rail-card">
              <p className="section-label">Desk controls</p>
              <h2 className="mt-2 text-2xl font-black leading-none">Newsroom command</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Scan, select, verify, brief, then publish. Keep sources visible before trusting the script.
              </p>
              <nav className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-1">
                <Tab label="Signals" value="signals" active={view} onClick={setView} />
                <Tab label="Brief" value="brief" active={view} onClick={setView} />
                <Tab label="Sources" value="sources" active={view} onClick={setView} />
                <Tab label="Setup" value="setup" active={view} onClick={setView} />
              </nav>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-1">
              <Metric label="Threshold" value={`${state?.config.threshold ?? 72}`} tone="blue" />
              <Metric label="Triggered" value={`${triggeredCount}`} tone="red" />
              <Metric label="Sources" value={`${activeSources}`} tone="blue" />
              <Metric label="Stories" value={`${stories.length}`} tone="gold" />
              <Metric label="Watching" value={`${watchingCount}`} tone="blue" />
              <Metric label="Briefed" value={`${briefedCount}`} tone="green" />
              <Metric label="Gemini" value={state?.config.geminiReady ? "Ready" : "Missing"} tone="green" />
              <Metric label="Email" value={state?.config.emailReady ? "Ready" : "Setup"} tone="red" />
            </div>

            <div className="rail-card mt-4">
              <p className="section-label">Last scan</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-[var(--ink)]">{latestRunText}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {lastRunTime ? `Updated ${formatDate(lastRunTime)} IST` : "Waiting for Cloudflare cron"}
              </p>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-[var(--muted)]">{latestRunMessage}</p>
              <div className="mt-4 flex gap-2">
                <button
                  className="action-button action-button-primary flex-1"
                  disabled={busy}
                  onClick={runScan}
                  type="button"
                >
                  {busy ? "Working" : "Run scan"}
                </button>
                <button className="action-button" disabled={busy} onClick={refreshState} type="button">
                  Refresh
                </button>
              </div>
            </div>
          </aside>

          <section className="signal-column">
            <div className="column-head">
              <div>
                <p className="section-label">Priority queue</p>
                <h2>Signals under watch</h2>
              </div>
              {state?.demoMode ? <Badge label="Demo" tone="gold" /> : <Badge label="Live" tone="green" />}
            </div>

            <div className="filter-bar">
              <input
                aria-label="Search stories"
                className="control-input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search issue, party, state, person"
                value={query}
              />
              <select
                aria-label="Desk filter"
                className="control-input control-select"
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

            <div className="story-list">
              <div className="queue-summary">
                <span>{filteredStories.length} visible</span>
                <span>{triggeredCount} above threshold</span>
                <span>{activeSources} active sources</span>
              </div>
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
                <div className="empty-state">No signals match this desk filter yet.</div>
              ) : null}
            </div>
          </section>

          <section className="detail-column">
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
      className={`nav-tab ${isActive ? "nav-tab-active" : ""}`}
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
    <div className="metric-card">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-xl font-black ${toneMap[tone]}`}>{value}</p>
    </div>
  );
}

function OpsCard({ label, value, tone }: { label: string; value: string; tone: "red" | "blue" }) {
  return (
    <div className={`ops-card ops-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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
  const scoreTone = story.totalScore >= 80 ? "red" : story.totalScore >= 72 ? "gold" : "blue";
  const evidenceLabel = story.brief?.evidenceGrade ?? (story.sourceType === "official" || story.sourceType === "html" ? "primary trail" : "needs brief");

  return (
    <button
      className={`story-card ${active ? "story-card-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <div className="story-meta-line">
        <span>{story.sourceName}</span>
        <span>{story.publishedAt ? formatDate(story.publishedAt) : formatDate(story.detectedAt)}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h4 className="line-clamp-2 text-base font-black leading-6">{story.title}</h4>
        <span className={`score-pill score-pill-${scoreTone}`}>{story.totalScore}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{story.summary || story.sourceName}</p>
      <div className="story-score-track mt-4" aria-label={`Score ${story.totalScore}`}>
        <span style={{ width: `${Math.max(4, Math.min(100, story.totalScore))}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge label={story.status} tone={story.status === "watching" ? "blue" : "red"} />
        <Badge label={evidenceLabel} tone={story.brief ? "green" : "gold"} />
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
    <div className="detail-stack p-5">
      <div className="dossier-hero">
        <div>
          <p className="section-label">Selected signal dossier</p>
          <h3 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-normal">{story.title}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{story.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge label={story.status} tone={story.status === "watching" ? "blue" : "red"} />
            <Badge label={story.sourceType.toUpperCase()} tone="blue" />
            <Badge label={story.sourceCountry || "global"} tone="gold" />
          </div>
        </div>
        <div className="dossier-score">
          <span>Story score</span>
          <strong>{story.totalScore}</strong>
          <small>Threshold aware</small>
        </div>
        <button
          className="action-button action-button-primary"
          disabled={busy}
          onClick={() => onGenerate(story.id)}
          type="button"
        >
          {story.brief ? "Refresh brief" : "Generate brief"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
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

      {story.sourceLinks?.length ? (
        <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          <h4 className="text-sm font-bold">Source trace</h4>
          <div className="mt-3 grid gap-2">
            {story.sourceLinks.slice(0, 6).map((link) => (
              <a className="source-trace" href={link.url} key={link.id} rel="noreferrer" target="_blank">
                <span>{link.sourceName}</span>
                <strong>{link.title}</strong>
              </a>
            ))}
          </div>
        </div>
      ) : null}

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
          className="action-button action-button-primary mt-5"
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
    <div className="brief-workspace no-scrollbar max-h-[calc(100vh-122px)] overflow-auto p-5">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">
        {brief.generatedBy === "gemini" ? "Gemini brief" : "Template brief"} generated {formatDate(brief.generatedAt)}
      </p>
      <h3 className="mt-1 text-2xl font-black leading-tight tracking-normal">{brief.briefTitle}</h3>
      <p className="mt-3 max-w-3xl text-lg font-semibold leading-7 text-[var(--red)]">{brief.hook}</p>

      <div className="script-map mt-5">
        {SCRIPT_STAGES.map(([label, time, description]) => (
          <div className="script-stage" key={label}>
            <span>{label}</span>
            <strong>{time}</strong>
            <p>{description}</p>
          </div>
        ))}
      </div>

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

      <div className="topic-cloud mt-5">
        {TOPIC_CLUSTERS.map((topic) => (
          <span key={topic}>{topic}</span>
        ))}
      </div>

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
    ["POLITILY_MAX_SOURCES_PER_RUN", "8 recommended for stable Worker scans"],
    ["POLITILY_FETCH_TIMEOUT_MS", "10000 recommended per source"],
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
      <div className="pipeline-map mt-5">
        {["Signal", "Score", "Research", "Verify", "Script", "Email"].map((step, index) => (
          <div className="pipeline-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
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
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
