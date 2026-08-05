"use client";

import { useEffect, useMemo, useState } from "react";
import type { BiasLean, DashboardState, SignalSource, SourceLane, StoredStory, StorySourceLink } from "../lib/types";
import { getDemoState } from "../lib/demo-data";
import {
  canonicalIssueKey,
  canonicalIssueLabel,
  issueSimilarity as sharedIssueSimilarity,
  issueTokens as sharedIssueTokens,
} from "../lib/issues";
import { buildWireOriginReport } from "../lib/wire-origin";

type View = "overview" | "watch" | "brief" | "sources" | "setup";
type SortKey = "rank" | "recent" | "oldest" | "viral" | "political" | "source";
type ScoreKey = "noveltyScore" | "politicalWeight" | "geopoliticalRelevance" | "viralPotential";

interface TopicRule {
  id: string;
  label: string;
  keywords: string[];
  summary: string;
}

interface EnrichedStory extends StoredStory {
  topics: TopicRule[];
  newsSnippet: string;
  whatHappenedShort: string;
  reachScore: number;
  reachReason: string;
  sourceNames: string[];
  sourceDiversity: number;
  independentSourceCount: number;
  sourcePriority: number | null;
  videoAngle: string;
  verificationState: string;
  verificationMethod: string;
  wireOrigin: string;
  biasSummary: string;
  sourceLaneSummary: string;
  scoringBreakdownLines: string[];
  sentimentLabel: string;
}

interface IssueCluster {
  id: string;
  label: string;
  topic: TopicRule;
  lead: EnrichedStory;
  stories: EnrichedStory[];
  sources: string[];
  sourceLinks: StorySourceLink[];
  reachScore: number;
  latestAt: string;
}

const TOPIC_RULES: TopicRule[] = [
  {
    id: "election",
    label: "Election",
    keywords: ["election", "vote", "poll", "campaign", "candidate", "constituency", "model code", "evm"],
    summary: "Campaign moves, voter mood, alliances, candidate conflict, EC actions, and issues that can affect electoral narratives.",
  },
  {
    id: "bypoll",
    label: "Bypoll",
    keywords: ["bypoll", "by-election", "byelection", "bankipur", "assembly seat", "candidate withdrawal"],
    summary: "High-signal local contests, candidate switches, star campaigners, caste/social arithmetic, and party testing grounds.",
  },
  {
    id: "youth-protest",
    label: "Youth protest",
    keywords: ["cjp", "cockroach janta party", "sansad chalo", "chalo sansad", "jantar mantar", "student protest", "paper leak", "neet"],
    summary: "Student movements, protest escalation, police response, government dialogue, opposition framing, and youth anger.",
  },
  {
    id: "parliament",
    label: "Parliament",
    keywords: ["parliament", "lok sabha", "rajya sabha", "bill", "ordinance", "committee", "speaker", "question hour"],
    summary: "Bills, policy changes, legislative conflict, committee work, and governance decisions that need document-led explainers.",
  },
  {
    id: "economy-policy",
    label: "Economy/Policy",
    keywords: ["budget", "inflation", "unemployment", "jobs", "welfare", "scheme", "subsidy", "gst", "tax", "rbi", "nso", "poverty", "ration"],
    summary: "Budget, jobs, inflation, welfare, tax, and policy-impact stories where data and public consequence matter most.",
  },
  {
    id: "courts",
    label: "Courts",
    keywords: ["court", "supreme court", "high court", "judgment", "bail", "petition", "constitution", "rights"],
    summary: "Legal and constitutional stories where the real video value comes from separating order, claim, and political spin.",
  },
  {
    id: "censorship",
    label: "Censorship",
    keywords: ["ban", "censorship", "cbfc", "film", "documentary", "takedown", "free speech", "public order"],
    summary: "Speech, cinema, takedown, public-order, and culture-war stories where history and legal grounds matter more than outrage.",
  },
  {
    id: "states",
    label: "States",
    keywords: ["punjab", "kashmir", "manipur", "assam", "bengal", "tamil nadu", "kerala", "maharashtra", "bihar", "uttar pradesh"],
    summary: "State politics, regional tensions, local history, communities, and ground-level reporting needed before national framing.",
  },
  {
    id: "party",
    label: "Party/BJP",
    keywords: ["bjp", "bharatiya janata party", "nda", "rss", "modi", "shah", "jp nadda", "nitin nabin"],
    summary: "BJP/NDA strategy, statements, alliances, defections, attack lines, and narrative competition.",
  },
  {
    id: "party-congress",
    label: "Party/Congress",
    keywords: ["congress", "rahul gandhi", "mallikarjun kharge", "priyanka gandhi", "inc", "youth congress", "nsui"],
    summary: "Congress strategy, internal conflict, opposition positioning, candidate moves, and attack lines.",
  },
  {
    id: "party-regional",
    label: "Party/Regional",
    keywords: ["aap", "tmc", "dmk", "rjd", "jdu", "sp", "samajwadi", "shiv sena", "ncp", "ysrcp", "tdp", "brs", "trs", "akali", "aiadmk", "bjd", "regional party"],
    summary: "State-party moves, regional bargaining, caste/community arithmetic, and local power shifts that national media can miss.",
  },
  {
    id: "opposition-india",
    label: "Opposition/INDIA bloc",
    keywords: ["india bloc", "i.n.d.i.a", "opposition bloc", "mahagathbandhan", "alliance meeting", "seat sharing", "opposition unity"],
    summary: "Opposition coordination, seat-sharing fights, joint protests, floor strategy, and alliance credibility.",
  },
  {
    id: "foreign-policy-india",
    label: "Foreign Policy - India",
    keywords: ["mea", "jaishankar", "foreign", "border", "china", "pakistan", "us", "america", "summit", "treaty", "sanction", "diplomacy", "brics", "quad"],
    summary: "Foreign policy, border, diplomacy, sanctions, and international reaction that need India-first context.",
  },
  {
    id: "global-politics",
    label: "Global Politics",
    keywords: ["united nations", "un ", "nato", "gaza", "ukraine", "russia", "israel", "iran", "europe", "africa", "latin america", "global politics"],
    summary: "International political shifts outside India that can still shape Indian narratives, diplomacy, or diaspora debate.",
  },
  {
    id: "social-viral",
    label: "Social/Viral",
    keywords: ["viral", "trending", "x.com", "twitter", "reddit", "youtube", "instagram", "social media", "video claim", "hashtag"],
    summary: "Early chatter from social platforms. Useful for speed, but never publish without independent verification.",
  },
  {
    id: "factcheck",
    label: "Fact-check",
    keywords: ["misinformation", "disinformation", "fake", "hoax", "fact check", "pib fact check", "alt news", "boom"],
    summary: "Claims, viral narratives, manipulation risk, and verification tasks before any creator script goes out.",
  },
];

const SCORE_EXPLAINERS: Record<ScoreKey, { label: string; method: string }> = {
  noveltyScore: {
    label: "Novelty",
    method: "Compares this headline against recent stored stories. High novelty means Politily has not seen a close match recently.",
  },
  politicalWeight: {
    label: "Political weight",
    method: "Looks for institutions, parties, elections, courts, policy, ministers, opposition, source priority, and governance terms.",
  },
  geopoliticalRelevance: {
    label: "Geo relevance",
    method: "Splits India foreign-policy signals from wider global politics using border, diplomacy, sanctions, China, Pakistan, UN, BRICS, and global reaction terms.",
  },
  viralPotential: {
    label: "Viral potential",
    method: "Looks for conflict, bans, arrests, protests, corruption, public-order risk, identity issues, numbers, headline tension, freshness, and source velocity.",
  },
};

const MIN_VISIBLE_STORY_DATE = Date.parse("2026-07-20T00:00:00+05:30");
const MIN_VISIBLE_STORY_LABEL = "20 Jul 2026";
const SHOW_STORY_IMAGES = false;

export function PolitilyDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [view, setView] = useState<View>("watch");
  const [status, setStatus] = useState("Connecting to Politily");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [scoreFocus, setScoreFocus] = useState<ScoreKey>("viralPotential");
  const [emailStartDate, setEmailStartDate] = useState(() => todayDateInput());
  const [emailEndDate, setEmailEndDate] = useState(() => todayDateInput());

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
      const urlStory = storyFromUrl();
      setState(next);
      setSelectedId((current) => current || urlStory || next.stories[0]?.id || "");
      if (urlStory && viewFromUrl() === "issue") {
        setDetailOpen(true);
      }
      if (urlStory && viewFromUrl() === "brief") {
        setView("brief");
      }
      setStatus(next.demoMode ? "Demo mode: storage not connected" : "Live monitor ready");
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
    setStatus("Generating deep English brief and compiled Roman Hindi master script");
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      const payload = (await response.json()) as { state?: DashboardState; story?: StoredStory; error?: string };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setState(payload.state);
      setSelectedId(storyId);
      setView("brief");
      setStatus(payload.story?.brief?.generatedBy === "template" ? "Gemini fallback draft saved. Retry this brief in 1-2 minutes." : "Brief ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Brief generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateResearchBrief(queryText: string) {
    const cleaned = queryText.trim();
    if (!cleaned) {
      return;
    }

    setBusy(true);
    setView("watch");
    setSelectedTopic("all");
    setStatus(`Researching "${cleaned}" across open sources before Gemini brief`);
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleaned }),
      });
      const payload = (await response.json()) as { state?: DashboardState; story?: StoredStory; error?: string };
      if (!response.ok || !payload.state || !payload.story) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setState(payload.state);
      setSelectedId(payload.story.id);
      setQuery(cleaned);
      setView("brief");
      setStatus(
        payload.story.brief?.generatedBy === "template"
          ? "Research draft saved, but Gemini fallback was used. Retry this issue before recording."
          : "Research brain brief ready"
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Research brief generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendDigestEmail(mode: "today" | "range") {
    setBusy(true);
    setStatus(mode === "today" ? "Sending today's strategic digest" : "Sending selected date-range digest");
    try {
      const response = await fetch("/api/email-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "today"
            ? { mode: "today" }
            : { mode: "range", startDate: emailStartDate, endDate: emailEndDate }
        ),
      });
      const payload = (await response.json()) as {
        sent?: boolean;
        message?: string;
        issueCount?: number;
        storyCount?: number;
        sourceCount?: number;
      };
      if (!response.ok || !payload.sent) {
        throw new Error(payload.message || `HTTP ${response.status}`);
      }

      setStatus(
        `${payload.message || "Digest email sent"} ${payload.issueCount ?? 0} issues, ${payload.storyCount ?? 0} reports, ${payload.sourceCount ?? 0} sources.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Digest email failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail() {
    setBusy(true);
    setStatus("Sending Resend test email");
    try {
      const response = await fetch("/api/test-email", { method: "POST" });
      const payload = (await response.json()) as { sent?: boolean; message?: string };
      if (!response.ok || !payload.sent) {
        throw new Error(payload.message || `HTTP ${response.status}`);
      }

      setStatus(payload.message || "Test email sent");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Test email failed");
    } finally {
      setBusy(false);
    }
  }

  function openIssue(storyId: string) {
    setSelectedId(storyId);
    setDetailOpen(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("story", storyId);
      url.searchParams.set("view", "issue");
      window.history.replaceState({}, "", url.toString());
    }
  }

  function closeIssue() {
    setDetailOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      window.history.replaceState({}, "", url.toString());
    }
  }

  const stories = state?.stories ?? [];
  const sources = state?.sources ?? [];
  const enrichedStories = useMemo(
    () =>
      stories
        .filter(isDisplayableStory)
        .filter(isOnOrAfterVisibleStartDate)
        .map((story) => enrichStory(story, sources)),
    [stories, sources]
  );

  const topicStats = useMemo(() => buildTopicStats(enrichedStories), [enrichedStories]);
  const sourceMix = useMemo(() => buildSourceMix(sources), [sources]);
  const portalNames = useMemo(() => buildPortalNames(enrichedStories), [enrichedStories]);
  const latestRun = state?.runs[0];
  const lastSuccessfulRun = state?.runs.find((run) => run.status === "complete");
  const latestSignalAt = newestStoryTime(enrichedStories);
  const triggeredCount = enrichedStories.filter((story) => story.totalScore >= (state?.config.threshold ?? 72)).length;
  const briefedCount = enrichedStories.filter((story) => story.brief).length;
  const tokenTotal = sumBriefTokens(enrichedStories);
  const headerClusters = useMemo(() => buildIssueClusters(enrichedStories, "recent"), [enrichedStories]);
  const headerIssueCount = headerClusters.length;
  const headerTopReach = headerClusters.reduce((max, cluster) => Math.max(max, cluster.reachScore), 0);
  const headerSourceCount = new Set(headerClusters.flatMap((cluster) => cluster.sources)).size || portalNames.length;

  const filteredStories = useMemo(() => {
    const cleanedQuery = query.trim().toLowerCase();
    return enrichedStories
      .filter((story) => {
        const matchesQuery = !cleanedQuery || matchesStoryQuery(story, cleanedQuery);
        const matchesTopic =
          Boolean(cleanedQuery) ||
          selectedTopic === "all" ||
          story.topics.some((topic) => topic.id === selectedTopic) ||
          story.tags.some((tag) => tag.toLowerCase().includes(selectedTopic));
        return matchesQuery && matchesTopic;
      })
      .sort((left, right) => compareStories(left, right, sortKey));
  }, [enrichedStories, query, selectedTopic, sortKey]);

  const hasActiveFilter = Boolean(query.trim()) || selectedTopic !== "all";
  const selectedStory =
    filteredStories.find((story) => story.id === selectedId) ??
    filteredStories[0] ??
    (hasActiveFilter ? undefined : enrichedStories[0]);
  const selectedIssueCluster = useMemo(
    () =>
      selectedStory
        ? buildIssueClusters(enrichedStories, sortKey).find((cluster) => cluster.stories.some((story) => story.id === selectedStory.id))
        : undefined,
    [enrichedStories, selectedStory, sortKey]
  );

  return (
    <main className="orm-shell">
      <header className="orm-topbar">
        <div className="brand-lockup">
          <strong>POLITILY</strong>
          <span>Political research war room</span>
        </div>
        <input
          aria-label="Search all political stories"
          className="top-search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setSelectedTopic("all");
              setView("watch");
            }
          }}
          placeholder="Search live issues or type any topic for research brain"
          value={query}
        />
        <div className="top-actions">
          <div className="crawl-chip" title={`${status}. ${freshnessLabel(latestSignalAt)}`}>
            <span>Last successful scan</span>
            <strong>{lastSuccessfulRun ? formatDateTime(lastSuccessfulRun.finishedAt || lastSuccessfulRun.startedAt) : "Waiting"}</strong>
            <small>
              {status} · {freshnessShortLabel(latestSignalAt)} · next {nextScanLabel(lastSuccessfulRun)}
            </small>
          </div>
          <div className="score-chip">
            <strong>{headerIssueCount}</strong>
            <span>Issues</span>
          </div>
          <div className="score-chip">
            <strong>{headerTopReach}</strong>
            <span>Top reach</span>
          </div>
          <div className="score-chip portal-chip">
            <strong>{headerSourceCount}</strong>
            <span>Sources</span>
          </div>
          <button className="btn btn-ghost" disabled={busy} onClick={refreshState} type="button">
            Refresh
          </button>
          <button className="btn btn-gold" disabled={busy} onClick={runScan} type="button">
            {busy ? "Working" : "Run scan"}
          </button>
        </div>
      </header>

      <aside className="orm-sidebar">
        <div className="nav-label">Desk</div>
        <NavItem active={view === "watch"} label="Issue radar" onClick={() => setView("watch")} badge={filteredStories.length} />
        <NavItem active={view === "overview"} label="Snapshot" onClick={() => setView("overview")} />
        <NavItem active={view === "brief"} label="Brief + script" onClick={() => setView("brief")} />
        <div className="nav-label">Research</div>
        <NavItem active={view === "sources"} label="Sources" onClick={() => setView("sources")} />
        <NavItem active={view === "setup"} label="Setup" onClick={() => setView("setup")} />

        <div className="sidebar-block">
          <div className="nav-label">Topic filters</div>
          <button
            className={`topic-nav ${selectedTopic === "all" ? "active" : ""}`}
            onClick={() => setSelectedTopic("all")}
            type="button"
          >
            <span>All topics</span>
            <strong>{enrichedStories.length}</strong>
          </button>
          {topicStats.map((topic) => (
            <button
              className={`topic-nav ${selectedTopic === topic.id ? "active" : ""}`}
              key={topic.id}
              onClick={() => {
                setSelectedTopic(topic.id);
                setView("watch");
              }}
              type="button"
            >
              <span>{topic.label}</span>
              <strong>{topic.count}</strong>
            </button>
          ))}
        </div>
      </aside>

      <section className="orm-main">
        {view === "overview" ? (
          <section className="kpi-grid">
            <Kpi tone="gold" label="Signals" value={enrichedStories.length} sub="stored stories" />
            <Kpi tone="orange" label="Triggered" value={triggeredCount} sub={`threshold ${state?.config.threshold ?? 72}`} />
            <Kpi tone="green" label="Briefs" value={briefedCount} sub="generated" />
            <Kpi tone="blue" label="Portals" value={portalNames.length} sub={`visible since ${MIN_VISIBLE_STORY_LABEL}`} />
            <Kpi tone="purple" label="Gemini tokens" value={formatTokens(tokenTotal)} sub="brief generation only" />
            <Kpi tone="red" label="Email" value={state?.config.emailReady ? "Ready" : "Pending"} sub="Resend domain" />
          </section>
        ) : null}

        {view === "overview" ? (
          <OverviewDesk
            latestRun={latestRun}
            onTopicClick={(topicId) => {
              setSelectedTopic(topicId);
              setView("watch");
            }}
            portalNames={portalNames}
            sourceMix={sourceMix}
            stories={enrichedStories}
            topicStats={topicStats}
          />
        ) : null}

        {view === "watch" ? (
          <WatchDesk
            busy={busy}
            onGenerate={generateBrief}
            onResearchQuery={generateResearchBrief}
            onScoreFocus={setScoreFocus}
            onSelect={openIssue}
            query={query}
            scoreFocus={scoreFocus}
            selectedStory={selectedStory}
            selectedTopic={selectedTopic}
            setSelectedTopic={setSelectedTopic}
            setSortKey={setSortKey}
            sortKey={sortKey}
            stories={filteredStories}
          />
        ) : null}

        {view === "brief" && selectedStory ? (
          <BriefDesk busy={busy} onGenerate={generateBrief} story={selectedStory} />
        ) : null}

        {view === "sources" && state ? <SourceDesk sourceMix={sourceMix} sources={sources} /> : null}
        {view === "setup" && state ? (
          <SetupDesk
            busy={busy}
            emailEndDate={emailEndDate}
            emailStartDate={emailStartDate}
            latestRun={latestRun}
            onEmailEndDate={setEmailEndDate}
            onEmailStartDate={setEmailStartDate}
            onSendDigest={sendDigestEmail}
            onSendTestEmail={sendTestEmail}
            state={state}
          />
        ) : null}
      </section>

      {selectedStory ? (
        <SelectedStoryFooter
          busy={busy}
          onGenerate={generateBrief}
          onOpenBrief={() => setView("brief")}
          story={selectedStory}
        />
      ) : null}
      {detailOpen && selectedStory ? (
        <IssueDetailPage
          busy={busy}
          cluster={selectedIssueCluster}
          onClose={closeIssue}
          onGenerate={generateBrief}
          onOpenBrief={() => {
            setView("brief");
            closeIssue();
          }}
          story={selectedStory}
        />
      ) : null}
    </main>
  );
}

function NavItem({ active, label, onClick, badge }: { active: boolean; label: string; onClick: () => void; badge?: number }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span className="nav-dot" />
      <span>{label}</span>
      {typeof badge === "number" ? <strong>{badge}</strong> : null}
    </button>
  );
}

function Kpi({ tone, label, value, sub }: { tone: string; label: string; value: string | number; sub: string }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function SelectedStoryFooter({
  story,
  busy,
  onGenerate,
  onOpenBrief,
}: {
  story: EnrichedStory;
  busy: boolean;
  onGenerate: (storyId: string) => void;
  onOpenBrief: () => void;
}) {
  const sourcePreview = story.sourceNames.slice(0, 2).join(", ");
  const extraSources = Math.max(0, story.sourceNames.length - 2);

  return (
    <footer className="selected-story-footer">
      <div className="selected-story-copy">
        <span>Selected issue</span>
        <strong>{story.title}</strong>
        <small>
          {story.topics[0]?.label || "Politics"} - {story.reachScore}/100 reach - {sourcePreview}
          {extraSources ? ` +${extraSources}` : ""} - {briefTokenLabel(story.brief)}
        </small>
      </div>
      <div className="selected-story-actions">
        <button className="btn btn-gold" disabled={busy} onClick={() => onGenerate(story.id)} type="button">
          {story.brief ? "Refresh" : "Brief"}
        </button>
        <button className="btn btn-ghost" onClick={onOpenBrief} type="button">
          Script
        </button>
      </div>
    </footer>
  );
}

function IssueDetailPage({
  story,
  cluster,
  busy,
  onGenerate,
  onOpenBrief,
  onClose,
}: {
  story: EnrichedStory;
  cluster?: IssueCluster;
  busy: boolean;
  onGenerate: (storyId: string) => void;
  onOpenBrief: () => void;
  onClose: () => void;
}) {
  const sourceTrail = cluster?.sourceLinks.length ? cluster.sourceLinks : uniqueStoryLinks(story.sourceLinks ?? []);
  const relatedReports = cluster?.stories.filter((item) => item.id !== story.id).slice(0, 8) ?? [];

  return (
    <section aria-label="Issue detail" className="issue-detail-overlay">
      <article className="issue-detail-page">
        <div className="issue-detail-toolbar">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Back to queue
          </button>
          <div className="issue-detail-actions">
            <button className="btn btn-gold" disabled={busy} onClick={() => onGenerate(story.id)} type="button">
              {story.brief ? "Refresh brief" : "Generate brief"}
            </button>
            <button className="btn btn-ghost" onClick={onOpenBrief} type="button">
              Brief page
            </button>
          </div>
        </div>

        <header className="issue-detail-head">
          <div>
            <span className="section-chip">{story.topics[0]?.label || "Politics"}</span>
            <h1>{cluster?.label || story.title}</h1>
            <p>{story.whatHappenedShort}</p>
            <div className="issue-proof-row">
              <strong>{cluster?.sources.length ?? story.sourceNames.length} sources</strong>
              <span>{cluster?.stories.length ?? 1} related report(s)</span>
              <span>{formatRelativeDate(story.detectedAt)}</span>
            </div>
          </div>
          <div className="reach-box">
            <strong>{story.reachScore}</strong>
            <span>Indian audience score</span>
          </div>
        </header>

        <div className="issue-detail-grid">
          <section className="panel span-2">
            <PanelTitle title="Issue bio" />
            <p className="muted-copy">{story.newsSnippet}</p>
            <div className="action-row">
              <a className="btn btn-ghost" href={`/api/export?storyId=${story.id}`}>
                Export DOCX
              </a>
              <a className="btn btn-ghost" href={story.url} rel="noreferrer" target="_blank">
                Open lead source
              </a>
            </div>
          </section>
          <ResearchTile label="Video angle" value={story.videoAngle} />
          <ResearchTile label="Verification state" value={story.verificationState} />
          <ResearchTile label="Verification method" value={story.verificationMethod} />
          <ResearchTile label="Wire origin" value={story.wireOrigin} />
          <ResearchTile label="Independent sources" value={`${story.independentSourceCount} non-wire visible source(s)`} />
          <ResearchTile label="Source lanes" value={story.sourceLaneSummary} />
          <ResearchTile label="Credibility bias" value={story.biasSummary} />
          <ResearchTile label="Sentiment / backlash" value={story.sentimentLabel} />
          <ResearchTile label="Audience reach why" value={story.reachReason} />
          <ResearchTile label="Token use" value={briefTokenLabel(story.brief)} />
          <section className="panel span-2">
            <PanelTitle title="Score grounding" />
            <div className="score-grid compact">
              <ScoreReadout label="Novelty" value={story.noveltyScore} />
              <ScoreReadout label="Political" value={story.politicalWeight} />
              <ScoreReadout label="Geo" value={story.geopoliticalRelevance} />
              <ScoreReadout label="Viral" value={story.viralPotential} />
            </div>
            <ul className="score-breakdown-list">
              {story.scoringBreakdownLines.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          {relatedReports.length ? (
            <section className="panel span-2">
              <PanelTitle title="Related reports inside this issue" />
              <div className="related-report-list">
                {relatedReports.map((report) => (
                  <a href={report.url} key={report.id} rel="noreferrer" target="_blank">
                    <span>{report.sourceName}</span>
                    <strong>{report.title}</strong>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
          <section className="panel span-2">
            <SourceTrail links={sourceTrail} />
          </section>
        </div>
      </article>
    </section>
  );
}

function ScoreReadout({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-card readonly">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="mini-meter"><span style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function OverviewDesk({
  stories,
  topicStats,
  sourceMix,
  portalNames,
  latestRun,
  onTopicClick,
}: {
  stories: EnrichedStory[];
  topicStats: Array<TopicRule & { count: number; maxScore: number }>;
  sourceMix: Array<{ label: string; count: number; active: number }>;
  portalNames: string[];
  latestRun: DashboardState["runs"][number] | undefined;
  onTopicClick: (topicId: string) => void;
}) {
  const topStories = stories.slice().sort((left, right) => right.reachScore - left.reachScore).slice(0, 4);
  const leadStory = topStories[0] ?? stories[0];
  const urgent = stories.filter((story) => story.reachScore >= 72).length;

  return (
    <div className="overview-grid">
      {leadStory ? (
        <section className={`panel lead-story span-2 ${shouldShowStoryImage(leadStory) ? "" : "no-media"}`}>
          <div className="lead-copy">
            <span className="section-chip">Lead video candidate</span>
            <h1>{leadStory.title}</h1>
            <p>{leadStory.newsSnippet}</p>
            <div className="lead-meta-row">
              <span>{leadStory.sourceName}</span>
              <span>{formatRelativeDate(leadStory.publishedAt || leadStory.detectedAt)}</span>
              <strong>{leadStory.reachScore}/100 reach</strong>
            </div>
            <div className="action-row">
              <a className="btn btn-gold" href={leadStory.url} rel="noreferrer" target="_blank">
                Open report
              </a>
              <button className="btn btn-ghost" onClick={() => onTopicClick(leadStory.topics[0]?.id || "all")} type="button">
                View topic
              </button>
            </div>
          </div>
          {shouldShowStoryImage(leadStory) ? <StoryImage story={leadStory} variant="hero" /> : null}
        </section>
      ) : null}

      <section className="panel span-2">
        <PanelTitle title="Topic distribution" />
        <div className="topic-grid">
          {topicStats.map((topic) => (
            <button className="topic-card" key={topic.id} onClick={() => onTopicClick(topic.id)} type="button">
              <div className="topic-card-top">
                <strong>{topic.label}</strong>
                <span>{topic.count}</span>
              </div>
              <p>{topic.summary}</p>
              <div className="mini-meter">
                <span style={{ width: `${topic.maxScore}%` }} />
              </div>
              <small>Top reach {topic.maxScore}/100</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelTitle title="Newsroom strategy" />
        <div className="strategy-stack">
          <StrategyRow label="Use today" value={`${urgent} stories above reach threshold`} />
          <StrategyRow label="Brief discipline" value="Generate only the strongest 12-15 briefs per day." />
          <StrategyRow label="Verification rule" value="No one-source video. Require primary record or multi-source trail." />
          <StrategyRow label="Script depth" value="Research in English, questions-first STEPPS outline, conclusion, and 2500-3400 word Roman Hindi/Hinglish master script." />
        </div>
      </section>

      <section className="panel">
        <PanelTitle title="Today's portals" />
        <p className="portal-summary">
          {portalNames.length} unique portals cited since {MIN_VISIBLE_STORY_LABEL}.
        </p>
        <div className="portal-chip-list">
          {portalNames.slice(0, 10).map((portal) => (
            <span key={portal}>{portal}</span>
          ))}
          {portalNames.length > 10 ? <strong>+{portalNames.length - 10} more</strong> : null}
        </div>
        <PanelTitle title="Source lanes" />
        <div className="source-mix-list">
          {sourceMix.map((source) => (
            <div className="source-mix-row" key={source.label}>
              <span>{source.label}</span>
              <strong>{source.active}/{source.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-2">
        <PanelTitle title="Top video candidates" />
        <div className="compact-story-list">
          {topStories.map((story) => (
            <div className="compact-story" key={story.id}>
              {shouldShowStoryImage(story) ? <StoryImage story={story} variant="mini" /> : null}
              <div>
                <strong>{story.title}</strong>
                <p>{story.newsSnippet}</p>
              </div>
              <span>{story.reachScore}/100</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelTitle title="Latest scan health" />
        <p className="muted-copy">
          {latestRun
            ? `${latestRun.status.toUpperCase()} - ${latestRun.scannedCount} scanned, ${latestRun.createdCount} new, ${latestRun.triggeredCount} triggered.`
            : "Waiting for first scan."}
        </p>
        <p className="warning-copy">{latestRun?.message || "No latest warning."}</p>
      </section>
    </div>
  );
}

function WatchDesk({
  stories,
  selectedStory,
  selectedTopic,
  query,
  sortKey,
  setSortKey,
  setSelectedTopic,
  scoreFocus,
  onScoreFocus,
  onSelect,
  busy,
  onGenerate,
  onResearchQuery,
}: {
  stories: EnrichedStory[];
  selectedStory?: EnrichedStory;
  selectedTopic: string;
  query: string;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  setSelectedTopic: (value: string) => void;
  scoreFocus: ScoreKey;
  onScoreFocus: (value: ScoreKey) => void;
  onSelect: (id: string) => void;
  busy: boolean;
  onGenerate: (storyId: string) => void;
  onResearchQuery: (query: string) => void;
}) {
  const clusters = useMemo(() => buildIssueClusters(stories, sortKey), [stories, sortKey]);
  const selectedCluster = selectedStory
    ? clusters.find((cluster) => cluster.stories.some((story) => story.id === selectedStory.id))
    : clusters[0];
  const researchQuery = query.trim();

  return (
    <>
      <div className="watch-grid">
        <section className="panel feed-panel">
          <div className="feed-tools">
            <PanelTitle title="Issue queue" />
            <select className="select-control" onChange={(event) => setSortKey(event.target.value as SortKey)} value={sortKey}>
              <option value="rank">Rank: highest score</option>
              <option value="recent">Recent first</option>
              <option value="oldest">Old to new</option>
              <option value="viral">Viral potential</option>
              <option value="political">Political weight</option>
              <option value="source">Source priority</option>
            </select>
          </div>
          <div className="pill-row">
            <button className={`pill ${selectedTopic === "all" ? "active" : ""}`} onClick={() => setSelectedTopic("all")} type="button">All</button>
            {TOPIC_RULES.map((topic) => (
              <button className={`pill ${selectedTopic === topic.id ? "active" : ""}`} key={topic.id} onClick={() => setSelectedTopic(topic.id)} type="button">
                {topic.label}
              </button>
            ))}
          </div>
          {researchQuery ? (
            <ResearchIntentCard
              busy={busy}
              matchCount={clusters.length}
              onResearch={() => onResearchQuery(researchQuery)}
              query={researchQuery}
            />
          ) : null}
          <div className="story-feed issue-feed">
            {clusters.map((cluster) => (
              <IssueClusterCard
                active={cluster.id === selectedCluster?.id}
                cluster={cluster}
                key={cluster.id}
                onSelect={onSelect}
              />
            ))}
            {!clusters.length ? <div className="empty-state">No live issue cards match yet. Use Research Brain above to investigate this topic anyway.</div> : null}
          </div>
        </section>

        <section className="panel dossier-panel">
          {selectedStory ? (
            <StoryDossier
              busy={busy}
              cluster={selectedCluster}
              onGenerate={onGenerate}
              onScoreFocus={onScoreFocus}
              scoreFocus={scoreFocus}
              story={selectedStory}
            />
          ) : (
            <div className="empty-state">Select a story to inspect the research dossier.</div>
          )}
        </section>
      </div>
    </>
  );
}

function IssueClusterCard({
  cluster,
  active,
  onSelect,
}: {
  cluster: IssueCluster;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const lead = cluster.lead;
  const sourcePreview = cluster.sources.slice(0, 4);
  const evidence = issueEvidenceLabel(lead, cluster.sources.length);
  const briefState = briefStateLabel(lead);

  return (
    <button className={`story-post issue-card ${active ? "active" : ""} ${shouldShowStoryImage(lead) ? "" : "no-media"}`} onClick={() => onSelect(lead.id)} type="button">
      <div className="issue-card-top">
        <div className="issue-card-labels">
          <span className="source-pill">{cluster.topic.label}</span>
          <span>{formatRelativeDate(cluster.latestAt)}</span>
        </div>
        <strong className="issue-score-badge">
          {cluster.reachScore}
          <span>/100</span>
        </strong>
      </div>
      {shouldShowStoryImage(lead) ? <StoryImage story={lead} variant="thumb" /> : null}
      <div className="story-post-body">
        <h3>{cluster.label}</h3>
        <p>{lead.newsSnippet}</p>
        <div className="issue-source-strip">
          {sourcePreview.map((source) => (
            <span key={source}>{source}</span>
          ))}
          {cluster.sources.length > sourcePreview.length ? <strong>+{cluster.sources.length - sourcePreview.length}</strong> : null}
        </div>
        <div className="credibility-strip">
          <span>{lead.sourceLaneSummary}</span>
          <span>{lead.biasSummary}</span>
          <span>{lead.sentimentLabel}</span>
        </div>
        <div className="issue-micro-grid">
          <span className="issue-micro">
            <b>{lead.viralPotential}</b>
            <small>Viral</small>
          </span>
          <span className="issue-micro">
            <b>{lead.politicalWeight}</b>
            <small>Political</small>
          </span>
          <span className="issue-micro">
            <b>{cluster.sources.length}</b>
            <small>Sources</small>
          </span>
          <span className="issue-micro">
            <b>{cluster.stories.length}</b>
            <small>Reports</small>
          </span>
          <span className="issue-micro">
            <b>{lead.sentimentScore}</b>
            <small>Mood</small>
          </span>
        </div>
        <div className="post-signal-line">
          <strong>{evidence}</strong>
          <span>{briefState} - tap to inspect source proof</span>
        </div>
      </div>
    </button>
  );
}

function ResearchIntentCard({
  query,
  matchCount,
  busy,
  onResearch,
}: {
  query: string;
  matchCount: number;
  busy: boolean;
  onResearch: () => void;
}) {
  return (
    <section className="research-intent-card">
      <div>
        <span className="section-chip">Research brain</span>
        <strong>{query}</strong>
        <p>
          {matchCount
            ? `${matchCount} live issue cluster(s) match. Generate a deeper topic-level report only if this deserves your time.`
            : "No live card yet. Politily can still search open sources, create one topic-level issue, and run the critical-analysis brief."}
        </p>
      </div>
      <button className="btn btn-gold" disabled={busy} onClick={onResearch} type="button">
        {busy ? "Working" : "Generate research report"}
      </button>
    </section>
  );
}

function issueEvidenceLabel(story: EnrichedStory, sourceCount: number) {
  if (story.brief?.evidenceGrade === "primary-backed") {
    return "Primary-backed";
  }
  if (sourceCount >= 4) {
    return "Multi-source";
  }
  if (sourceCount >= 2) {
    return "Reported";
  }
  return "Thin trail";
}

function briefStateLabel(story: EnrichedStory) {
  if (!story.brief) {
    return "Brief pending";
  }
  if (story.brief.generatedBy === "template") {
    return "Draft needs retry";
  }
  return "Brief ready";
}

function shouldShowStoryImage(story: EnrichedStory) {
  return SHOW_STORY_IMAGES && Boolean(story.imageUrl);
}

function StoryImage({ story, variant = "thumb" }: { story: EnrichedStory; variant?: "hero" | "thumb" | "mini" | "dossier" }) {
  const [failed, setFailed] = useState(false);
  const label = story.topics[0]?.label || "Politics";
  if (!shouldShowStoryImage(story) || failed) {
    return null;
  }

  return (
    <div className={`story-image story-image-${variant}`}>
      <img alt="" loading="lazy" onError={() => setFailed(true)} src={story.imageUrl || ""} />
      <div className="image-overlay">
        <span>{label}</span>
        <strong>{story.reachScore}/100</strong>
      </div>
    </div>
  );
}

function StoryDossier({
  story,
  cluster,
  scoreFocus,
  onScoreFocus,
  busy,
  onGenerate,
}: {
  story: EnrichedStory;
  cluster?: IssueCluster;
  scoreFocus: ScoreKey;
  onScoreFocus: (value: ScoreKey) => void;
  busy: boolean;
  onGenerate: (storyId: string) => void;
}) {
  const explainer = scoreExplainer(story, scoreFocus);
  const sourceTrail = cluster?.sourceLinks.length ? cluster.sourceLinks : uniqueStoryLinks(story.sourceLinks ?? []);

  return (
    <div>
      <div className={`dossier-head ${shouldShowStoryImage(story) ? "" : "no-media"}`}>
        {shouldShowStoryImage(story) ? <StoryImage story={story} variant="dossier" /> : null}
        <div>
          <span className="section-chip">Selected issue</span>
          <h2>{cluster?.label || story.title}</h2>
          <p>{story.whatHappenedShort}</p>
          <p className="snippet-copy">{story.newsSnippet}</p>
          {cluster ? (
            <div className="issue-proof-row">
              <strong>{cluster.sources.length} sources</strong>
              <span>{cluster.stories.length} related reports grouped under this issue</span>
            </div>
          ) : null}
        </div>
        <div className="reach-box">
          <strong>{story.reachScore}</strong>
          <span>Indian audience score</span>
        </div>
      </div>

      <div className="action-row">
        <button className="btn btn-gold" disabled={busy} onClick={() => onGenerate(story.id)} type="button">
          {story.brief ? "Refresh brief" : "Generate brief"}
        </button>
        <a className="btn btn-ghost" href={`/api/export?storyId=${story.id}`}>
          Export DOCX
        </a>
        <a className="btn btn-ghost" href={story.url} rel="noreferrer" target="_blank">
          Open source
        </a>
      </div>

      <div className="score-grid">
        <ScoreButton active={scoreFocus === "noveltyScore"} label="Novelty" value={story.noveltyScore} onClick={() => onScoreFocus("noveltyScore")} />
        <ScoreButton active={scoreFocus === "politicalWeight"} label="Political" value={story.politicalWeight} onClick={() => onScoreFocus("politicalWeight")} />
        <ScoreButton active={scoreFocus === "geopoliticalRelevance"} label="Geo" value={story.geopoliticalRelevance} onClick={() => onScoreFocus("geopoliticalRelevance")} />
        <ScoreButton active={scoreFocus === "viralPotential"} label="Viral" value={story.viralPotential} onClick={() => onScoreFocus("viralPotential")} />
      </div>

      <div className="score-explain">
        <strong>{explainer.title}</strong>
        <p>{explainer.body}</p>
        {story.scoringBreakdownLines.length ? (
          <ul className="score-breakdown-list">
            {story.scoringBreakdownLines.slice(0, 6).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <small>Priority formula: novelty 24%, political 31%, geo 20%, viral 25%.</small>
      </div>

      <div className="insight-grid">
        <ResearchTile label="Video angle" value={story.videoAngle} />
        <ResearchTile label="Verification state" value={story.verificationState} />
        <ResearchTile label="Verification method" value={story.verificationMethod} />
        <ResearchTile label="Wire origin" value={story.wireOrigin} />
        <ResearchTile label="Independent sources" value={`${story.independentSourceCount} non-wire visible source(s)`} />
        <ResearchTile label="Credibility bias" value={story.biasSummary} />
        <ResearchTile label="Source lanes" value={story.sourceLaneSummary} />
        <ResearchTile label="Sentiment / backlash" value={story.sentimentLabel} />
        <ResearchTile label="Token use" value={briefTokenLabel(story.brief)} />
        <ResearchTile label="Audience reach why" value={story.reachReason} />
      </div>

      <SourceTrail links={sourceTrail} />
    </div>
  );
}

function ScoreButton({ active, label, value, onClick }: { active: boolean; label: string; value: number; onClick: () => void }) {
  return (
    <button className={`score-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="mini-meter"><span style={{ width: `${value}%` }} /></div>
    </button>
  );
}

function BriefDesk({ story, busy, onGenerate }: { story: EnrichedStory; busy: boolean; onGenerate: (storyId: string) => void }) {
  const brief = story.brief;

  if (!brief) {
    return (
      <section className="panel brief-empty">
        <PanelTitle title="Deep brief and compiled master script" />
        <h2>No generated brief yet</h2>
        <p>Generate a deep issue dossier with English research context, hard questions, data checks, STEPPS strategy, conclusion, and a compiled Roman Hindi/Hinglish master script.</p>
        <button className="btn btn-gold" disabled={busy} onClick={() => onGenerate(story.id)} type="button">
          Generate brief
        </button>
      </section>
    );
  }

  return (
    <section className="brief-grid">
      <div className="panel span-2">
        <div className={`brief-story-context ${shouldShowStoryImage(story) ? "" : "no-media"}`}>
          {shouldShowStoryImage(story) ? <StoryImage story={story} variant="dossier" /> : null}
          <div>
            <span className="section-chip">Original signal</span>
            <strong>{story.title}</strong>
            <p>{story.newsSnippet}</p>
          </div>
        </div>
        <div className="brief-title-row">
          <div>
            <PanelTitle title="Deep brief and compiled master script" />
            <h2>{brief.briefTitle}</h2>
            <p>{brief.hook}</p>
          </div>
          <a className="btn btn-gold" href={`/api/export?storyId=${story.id}`}>
            Export DOCX
          </a>
        </div>
        {brief.generatedBy === "template" ? (
          <div className="fallback-warning">
            <strong>Gemini did not complete this deep brief.</strong>
            <span>This is a structured research draft with 0 returned Gemini tokens. Retry the brief before using it for a hot viral video.</span>
          </div>
        ) : null}
        <div className="insight-grid">
          <ResearchTile label="Audience reach" value={`${brief.audienceReachScore ?? story.reachScore}/100 - ${brief.audienceReachReason || story.reachReason}`} />
          <ResearchTile
            label="Research depth"
            value={typeof brief.researchDepthScore === "number" ? `${brief.researchDepthScore}/100` : "Regenerate for depth score"}
          />
          <ResearchTile label="Evidence grade" value={brief.evidenceGrade} />
          <ResearchTile label="Gemini tokens" value={briefTokenLabel(brief)} />
          <ResearchTile label="Source confidence" value={brief.sourceConfidence} />
          <ResearchTile label="Caution" value={brief.caution} />
        </div>
      </div>

      <TextPanel title="What happened" text={brief.whatHappened} />
      <TextPanel title="Why it matters" text={brief.whyItMatters} />
      <TextPanel title="Historical context" text={brief.historicalContext} />
      <TextPanel title="Regional context" text={brief.regionalContext || brief.geographicalContext} />
      <TextPanel title="Institutional accountability" text={brief.institutionalContext || "No institutional accountability context generated yet."} />
      <TextPanel title="Power analysis" text={brief.powerAnalysis || "No power analysis generated yet."} />
      <ListPanel title="Questions this video will answer" items={brief.masterScriptQuestions ?? []} />
      <ListPanel title="Master script outline" items={brief.masterScriptOutline ?? []} />
      <ListPanel title="STEPPS strategy" items={brief.steppsStrategy ?? []} />
      <ListPanel title="Data points and datasets" items={brief.dataPoints ?? []} />
      <ListPanel title="Hard research questions" items={brief.researchQuestions ?? []} />
      <ListPanel title="Accountability map" items={brief.accountabilityMap ?? []} />
      <ListPanel title="Stakeholder map" items={brief.stakeholderMap ?? []} />
      <ListPanel title="Counter-arguments" items={brief.counterArguments ?? []} />
      <ListPanel title="Open questions" items={brief.openQuestions ?? []} />
      <ListPanel title="Monitoring queries" items={brief.monitoringQueries ?? []} />
      <ListPanel title="No video until" items={brief.noVideoUntil ?? []} />
      <ListPanel title="Storytelling beats" items={brief.storytellingBeats ?? []} />
      <ListPanel title="Facts and figures" items={brief.factsAndFigures} />
      <ListPanel title="Timeline" items={brief.timeline} />
      <ListPanel title="Source positions" items={brief.sourcePositions ?? []} />
      <ListPanel title="Video angles" items={brief.videoAngles ?? []} />
      <ListPanel title="Claim matrix" items={brief.claimMatrix} />
      <ListPanel title="Verification protocol" items={brief.verificationProtocol} />
      <ListPanel title="What happens next" items={brief.whatHappensNext} />
      <TextPanel title="Script conclusion" text={brief.scriptConclusion || "No compiled conclusion generated yet."} />

      <div className="panel span-2">
        <PanelTitle title="Compiled Roman Hindi master script" />
        <pre className="script-box">{brief.videoScript}</pre>
      </div>

      <div className="panel span-2">
        <PanelTitle title="Cited URLs" />
        <div className="url-list">
          {brief.citedUrls.map((url) => (
            <a href={url} key={url} rel="noreferrer" target="_blank">{url}</a>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourceDesk({ sources, sourceMix }: { sources: SignalSource[]; sourceMix: Array<{ label: string; count: number; active: number }> }) {
  const grouped = groupSources(sources);

  return (
    <section className="source-grid">
      <div className="panel">
        <PanelTitle title="Source reliability hierarchy" />
        <div className="strategy-stack">
          <StrategyRow label="Primary" value="PIB, PMO, courts, MEA, PRS, official orders and party releases." />
          <StrategyRow label="Agency" value="PTI, ANI, Reuters, AP used for speed and triangulation." />
          <StrategyRow label="National media" value="Indian Express, The Hindu, HT, NDTV, ET and others used for framing comparison." />
          <StrategyRow label="Regional" value="State-level and local context before calling a story propaganda, censorship, or public-order risk." />
          <StrategyRow label="Social/Viral" value="X, Reddit, YouTube and viral-search lanes are early-warning only; confirm before scripting." />
        </div>
      </div>
      <div className="panel">
        <PanelTitle title="Active source mix" />
        {sourceMix.map((item) => (
          <div className="source-mix-row" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.active}/{item.count}</strong>
          </div>
        ))}
      </div>
      <div className="panel span-2">
        <PanelTitle title="Sources watched by Politily" />
        <div className="source-table">
          {grouped.map(([category, items]) => (
            <div className="source-group" key={category}>
              <h3>{category}</h3>
              {items.map((source) => (
                <div className="source-row" key={source.id}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.url}</span>
                    <span className="source-meta-line">
                      {formatSourceLaneLabel(source.sourceLane)} | {formatBiasLabel(source.biasLean)} | {source.language || "language unknown"}
                    </span>
                    <span className="source-meta-line">{source.verificationMethod || "Verification: compare with at least one independent source before scripting."}</span>
                  </div>
                  <small>{source.region}</small>
                  <b>{source.priority}</b>
                  <em>{source.active ? "Active" : "Paused"}</em>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SetupDesk({
  state,
  latestRun,
  busy,
  emailStartDate,
  emailEndDate,
  onEmailStartDate,
  onEmailEndDate,
  onSendDigest,
  onSendTestEmail,
}: {
  state: DashboardState;
  latestRun: DashboardState["runs"][number] | undefined;
  busy: boolean;
  emailStartDate: string;
  emailEndDate: string;
  onEmailStartDate: (value: string) => void;
  onEmailEndDate: (value: string) => void;
  onSendDigest: (mode: "today" | "range") => void;
  onSendTestEmail: () => void;
}) {
  const tokenTotal = sumBriefTokens(state.stories.filter(isDisplayableStory).filter(isOnOrAfterVisibleStartDate).map((story) => enrichStory(story, state.sources)));

  return (
    <section className="setup-grid">
      <div className="panel">
        <PanelTitle title="System status" />
        <div className="strategy-stack">
          <StrategyRow label="D1 database" value={state.config.storageReady ? "Ready. 4 tables is correct." : "Missing."} />
          <StrategyRow label="Gemini" value={state.config.geminiReady ? `Ready: ${state.config.model}` : "Missing API key."} />
          <StrategyRow label="Token policy" value={`Scanning uses RSS/GDELT/open pages: 0 Gemini tokens. Generated briefs recorded so far: ${formatTokens(tokenTotal)} tokens.`} />
          <StrategyRow label="Email" value={state.config.emailReady ? "Ready." : "Pending. Resend domain/API still needed."} />
          <StrategyRow label="Auto alerts" value={`Fast signal emails at ${state.config.alertThreshold}/100. Deep brief trigger remains ${state.config.threshold}/100.`} />
          <StrategyRow label="Cron" value="Use */2 * * * * for early scans plus 30 9,15 * * * for 3 PM and 9 PM IST media reports. Cloudflare UI shows UTC, app shows IST." />
        </div>
      </div>
      <div className="panel">
        <PanelTitle title="Email digest" />
        <p className="muted-copy">Send a ranked newsroom digest from stored issues. This does not spend Gemini tokens; it emails scores, source trail, snippets, verification risk, and creator angle.</p>
        <div className="digest-form">
          <label className="date-field">
            <span>From</span>
            <input onChange={(event) => onEmailStartDate(event.target.value)} type="date" value={emailStartDate} />
          </label>
          <label className="date-field">
            <span>To</span>
            <input onChange={(event) => onEmailEndDate(event.target.value)} type="date" value={emailEndDate} />
          </label>
        </div>
        <div className="action-row">
          <button className="btn btn-ghost" disabled={busy || !state.config.emailReady} onClick={onSendTestEmail} type="button">
            Send test email
          </button>
          <button className="btn btn-gold" disabled={busy || !state.config.emailReady} onClick={() => onSendDigest("today")} type="button">
            Send today till now
          </button>
          <button className="btn btn-ghost" disabled={busy || !state.config.emailReady} onClick={() => onSendDigest("range")} type="button">
            Send selected dates
          </button>
        </div>
        {!state.config.emailReady ? <p className="warning-copy">Email is pending. Add RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL first.</p> : null}
      </div>
      <div className="panel">
        <PanelTitle title="Priority basis" />
        <p className="muted-copy">Total score is a weighted ranking: novelty 24%, political weight 31%, geopolitical relevance 20%, viral potential 25%.</p>
        <p className="muted-copy">For daily workflow, sort by rank first, then inspect viral and source diversity before generating a brief.</p>
      </div>
      <div className="panel span-2">
        <PanelTitle title="Latest run" />
        <p className="muted-copy">
          {latestRun
            ? `${latestRun.status.toUpperCase()} - ${latestRun.scannedCount} scanned, ${latestRun.createdCount} new, ${latestRun.triggeredCount} triggered, ${latestRun.emailedCount} emailed.`
            : "No run recorded yet."}
        </p>
        <p className="warning-copy">{latestRun?.message || "No warning in latest run."}</p>
      </div>
    </section>
  );
}

function PanelTitle({ title }: { title: string }) {
  return (
    <div className="panel-title">
      <span>{title}</span>
      <i />
    </div>
  );
}

function StrategyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="strategy-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResearchTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="research-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TextPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel">
      <PanelTitle title={title} />
      <p className="muted-copy">{text}</p>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="panel">
      <PanelTitle title={title} />
      <div className="bullet-list">
        {items.map((item) => <p key={item}>{item}</p>)}
      </div>
    </div>
  );
}

function SourceTrail({ links }: { links: StorySourceLink[] }) {
  return (
    <div className="source-trail">
      <PanelTitle title="Issue source proof" />
      {links.length ? (
        links.slice(0, 8).map((link) => (
          <a href={link.url} key={`${link.sourceName}-${link.url}`} rel="noreferrer" target="_blank">
            <span>{cleanDisplayText(link.sourceName)}</span>
            <strong>{cleanDisplayText(link.title)}</strong>
            <small>
              {formatSourceLaneLabel(link.sourceLane)} | {formatBiasLabel(link.biasLean)} | {link.verificationMethod || "corroborate before scripting"}
            </small>
          </a>
        ))
      ) : (
        <p className="muted-copy">No secondary source trail yet. Treat as thin until verified.</p>
      )}
    </div>
  );
}

function enrichStory(story: StoredStory, sources: SignalSource[]): EnrichedStory {
  const displayStory = {
    ...story,
    title: cleanDisplayText(story.title),
    summary: cleanDisplayText(story.summary),
    sourceName: cleanDisplayText(story.sourceName),
    articleExcerpt: story.articleExcerpt ? cleanDisplayText(story.articleExcerpt) : story.articleExcerpt,
  };
  const topics = deriveTopics(displayStory);
  const sourceLinks = uniqueStoryLinks(story.sourceLinks ?? []);
  const sourceNames = Array.from(new Set([displayStory.sourceName, ...sourceLinks.map((link) => cleanDisplayText(link.sourceName))].filter(Boolean)));
  const matchingSource = sources.find((source) => source.name.toLowerCase() === story.sourceName.toLowerCase());
  const sourceBiases = uniqueStrings([
    displayStory.sourceName ? matchingSource?.biasLean ?? inferBiasFromName(displayStory.sourceName) : "",
    ...sourceLinks.map((link) => link.biasLean ?? inferBiasFromName(link.sourceName)),
  ]);
  const sourceLanes = uniqueStrings([
    matchingSource?.sourceLane ?? inferLaneFromSource(matchingSource, displayStory.sourceName),
    ...sourceLinks.map((link) => link.sourceLane ?? inferLaneFromSource(undefined, link.sourceName)),
  ]);
  const wireOriginReport = buildWireOriginReport({
    title: displayStory.title,
    summary: displayStory.summary,
    url: displayStory.url,
    sourceName: displayStory.sourceName,
    verificationMethod: story.verificationMethod,
    sourceLinks,
  });
  const baseVerificationMethod =
    story.verificationMethod ||
    sourceLinks.find((link) => link.verificationMethod)?.verificationMethod ||
    matchingSource?.verificationMethod ||
    verificationMethodForDashboard(story, wireOriginReport.independentSourceCount || sourceNames.length);
  const verificationMethod = wireOriginReport.agency
    ? `${wireOriginReport.verificationWarning} ${baseVerificationMethod}`
    : baseVerificationMethod;
  const reachScore = story.brief?.audienceReachScore ?? clamp(Math.round(story.totalScore * 0.72 + story.viralPotential * 0.18 + story.politicalWeight * 0.1));
  const newsSnippet = cleanSummary(displayStory.articleExcerpt || displayStory.summary, displayStory, 175);

  return {
    ...displayStory,
    topics,
    sourceLinks,
    newsSnippet,
    whatHappenedShort: cleanSummary(story.brief?.whatHappened || displayStory.articleExcerpt || displayStory.summary, displayStory),
    reachScore,
    reachReason: story.brief?.audienceReachReason || reachReason(story, reachScore),
    sourceNames,
    sourceDiversity: sourceNames.length,
    independentSourceCount: wireOriginReport.independentSourceCount,
    sourcePriority: matchingSource?.priority ?? null,
    videoAngle: story.brief?.videoAngles?.[0] || videoAngleFor(story, topics),
    verificationState: verificationState(story, wireOriginReport.independentSourceCount || sourceNames.length),
    verificationMethod,
    wireOrigin: wireOriginReport.label,
    biasSummary: sourceBiases.length ? sourceBiases.map(formatBiasLabel).join(", ") : "Bias: unknown",
    sourceLaneSummary: sourceLanes.length ? sourceLanes.map(formatSourceLaneLabel).join(", ") : "Lane: portal",
    scoringBreakdownLines: buildScoringBreakdownLines(story, sourceNames.length),
    sentimentLabel: sentimentLabel(story.sentimentScore),
  };
}

function deriveTopics(story: StoredStory) {
  const text = [
    story.title,
    story.summary,
    story.sourceName,
    story.verificationMethod || "",
    story.tags.join(" "),
    (story.sourceLinks ?? [])
      .map((link) => `${link.sourceName} ${link.sourceLane ?? ""} ${link.biasLean ?? ""} ${link.verificationMethod ?? ""}`)
      .join(" "),
  ].join(" ").toLowerCase();
  const matches = TOPIC_RULES.filter((topic) => topic.keywords.some((keyword) => text.includes(keyword)));
  return matches.length ? matches : [TOPIC_RULES[0]];
}

function buildTopicStats(stories: EnrichedStory[]) {
  return TOPIC_RULES.map((topic) => {
    const matches = stories.filter((story) => story.topics.some((storyTopic) => storyTopic.id === topic.id));
    return {
      ...topic,
      count: matches.length,
      maxScore: matches.reduce((max, story) => Math.max(max, story.reachScore), 0),
    };
  }).filter((topic) => topic.count > 0);
}

function buildSourceMix(sources: SignalSource[]) {
  const groups = new Map<string, { label: string; count: number; active: number }>();
  sources.forEach((source) => {
    const label = formatSourceLaneLabel(source.sourceLane) || source.category.split("/")[0].trim() || source.type;
    const current = groups.get(label) ?? { label, count: 0, active: 0 };
    current.count += 1;
    current.active += source.active ? 1 : 0;
    groups.set(label, current);
  });

  return Array.from(groups.values()).sort((left, right) => right.active - left.active || left.label.localeCompare(right.label));
}

function buildPortalNames(stories: EnrichedStory[]) {
  const names = new Set<string>();
  stories.forEach((story) => {
    story.sourceNames.forEach((name) => {
      const cleaned = cleanDisplayText(name);
      if (cleaned) {
        names.add(cleaned);
      }
    });
  });

  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function buildIssueClusters(stories: EnrichedStory[], sortKey: SortKey = "recent") {
  const clusters: IssueCluster[] = [];
  const sorted = stories.slice().sort((left, right) => compareStories(left, right, sortKey));

  sorted.forEach((story) => {
    const key = issueKey(story);
    const match =
      clusters.find((cluster) => cluster.id === key) ||
      clusters.find((cluster) => storyIssueSimilarity(story, cluster.lead) >= 0.62);

    if (match) {
      match.stories.push(story);
      match.sources = uniqueStrings([...match.sources, ...story.sourceNames]);
      match.sourceLinks = uniqueStoryLinks(match.sourceLinks.concat(story.sourceLinks ?? []));
      match.reachScore = Math.max(match.reachScore, story.reachScore);
      match.latestAt = storyDateValue(story) > dateValue(match.latestAt) ? storyDisplayTime(story) : match.latestAt;
      if (compareStories(story, match.lead, sortKey) < 0) {
        match.lead = story;
        match.label = issueLabel(story);
      }
      return;
    }

    clusters.push({
      id: key,
      label: issueLabel(story),
      topic: story.topics[0] ?? TOPIC_RULES[0],
      lead: story,
      stories: [story],
      sources: story.sourceNames,
      sourceLinks: uniqueStoryLinks(story.sourceLinks ?? []),
      reachScore: story.reachScore,
      latestAt: storyDisplayTime(story),
    });
  });

  return clusters.sort((left, right) => compareClusters(left, right, sortKey));
}

function issueKey(story: EnrichedStory) {
  return canonicalIssueKey(story);
}

function issueLabel(story: EnrichedStory) {
  return canonicalIssueLabel(story);
}

function storyIssueSimilarity(left: EnrichedStory, right: EnrichedStory) {
  return sharedIssueSimilarity(left, right);
}

function issueTokens(value: string) {
  return sharedIssueTokens(value);
}

function removeSourceSuffix(value: string) {
  return cleanDisplayText(value).replace(/\s+-\s+[^-]{2,40}$/g, "");
}

function compareStories(left: EnrichedStory, right: EnrichedStory, sortKey: SortKey) {
  if (sortKey === "recent") {
    return storyDateValue(right) - storyDateValue(left);
  }
  if (sortKey === "oldest") {
    return storyDateValue(left) - storyDateValue(right);
  }
  if (sortKey === "viral") {
    return right.viralPotential - left.viralPotential;
  }
  if (sortKey === "political") {
    return right.politicalWeight - left.politicalWeight;
  }
  if (sortKey === "source") {
    return (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0) || right.sourceDiversity - left.sourceDiversity;
  }

  return right.reachScore - left.reachScore || right.totalScore - left.totalScore || storyDateValue(right) - storyDateValue(left);
}

function compareClusters(left: IssueCluster, right: IssueCluster, sortKey: SortKey) {
  if (sortKey === "recent") {
    return dateValue(right.latestAt) - dateValue(left.latestAt);
  }
  if (sortKey === "oldest") {
    return dateValue(left.latestAt) - dateValue(right.latestAt);
  }
  if (sortKey === "viral") {
    return right.lead.viralPotential - left.lead.viralPotential || right.reachScore - left.reachScore;
  }
  if (sortKey === "political") {
    return right.lead.politicalWeight - left.lead.politicalWeight || right.reachScore - left.reachScore;
  }
  if (sortKey === "source") {
    return right.sources.length - left.sources.length || right.reachScore - left.reachScore;
  }

  return right.reachScore - left.reachScore || dateValue(right.latestAt) - dateValue(left.latestAt);
}

function scoreExplainer(story: EnrichedStory, key: ScoreKey) {
  const briefRationale = story.brief?.scoreRationale?.[key];
  return {
    title: `${SCORE_EXPLAINERS[key].label}: ${story[key]}/100`,
    body: briefRationale || SCORE_EXPLAINERS[key].method,
  };
}

function reachReason(story: StoredStory, reachScore: number) {
  if (reachScore >= 80) {
    return "High reach: strong public consequence, conflict, or emotional clarity for Indian viewers.";
  }
  if (reachScore >= 65) {
    return "Medium reach: useful if supported by documents, regional history, or a sharp explainer hook.";
  }
  return "Low to medium reach: keep watching unless primary documents or a stronger public angle appears.";
}

function videoAngleFor(story: StoredStory, topics: TopicRule[]) {
  const topic = topics[0]?.label || "Politics";
  if (story.viralPotential >= 72) {
    return `${topic} angle: explain the conflict, what is confirmed, and who gains from the narrative.`;
  }
  return `${topic} angle: build a short explainer only after primary records or multi-source corroboration.`;
}

function verificationState(story: StoredStory, sourceDiversity: number) {
  if (story.brief?.evidenceGrade === "primary-backed") {
    return "Primary-backed. Stronger candidate for publishing.";
  }
  if (sourceDiversity >= 3) {
    return "Multi-source trail. Still separate claims from confirmed facts.";
  }
  if (sourceDiversity >= 2) {
    return "Two-source trail. Needs primary document or regional context.";
  }
  return "Thin. Do not rely on this alone.";
}

function verificationMethodForDashboard(story: StoredStory, sourceDiversity: number) {
  if (story.tags.includes("fact-check")) {
    return `Fact-check lane: determined by claim language, fact-check source match, and ${sourceDiversity} corroborating source(s).`;
  }
  if (sourceDiversity >= 4) {
    return `Cross-source corroboration: ${sourceDiversity} unique source(s) grouped under one issue; still verify primary documents.`;
  }
  if (story.sourceType === "official" || story.sourceType === "legal") {
    return "Primary/official lane: verify the original order, press note, bill, or institutional document before scripting.";
  }
  return "Open-source lane: compare at least one primary record, one credible news report, and one counter-position before final video.";
}

function buildScoringBreakdownLines(story: StoredStory, sourceDiversity: number) {
  const breakdown = story.scoringBreakdown;
  const lines = [
    breakdown.velocitySignal,
    breakdown.sourceSignal || `${sourceDiversity} unique source(s) currently support this issue cluster.`,
    breakdown.politicalSignals.length ? `Political signals: ${breakdown.politicalSignals.slice(0, 5).join(", ")}` : "",
    breakdown.geopoliticalSignals.length ? `Foreign/global signals: ${breakdown.geopoliticalSignals.slice(0, 5).join(", ")}` : "",
    breakdown.viralSignals.length ? `Viral signals: ${breakdown.viralSignals.slice(0, 5).join(", ")}` : "",
    breakdown.sentimentSignals.length ? `Mood/backlash signals: ${breakdown.sentimentSignals.slice(0, 5).join(", ")}` : "",
    breakdown.noveltySignals.length ? breakdown.noveltySignals[0] : "",
    breakdown.formula || "Formula: novelty 24%, political 31%, geo 20%, viral 25%.",
  ];

  return uniqueStrings(lines);
}

function sentimentLabel(score: number) {
  if (score >= 76) {
    return `High backlash ${score}/100`;
  }
  if (score >= 58) {
    return `Watch mood ${score}/100`;
  }
  return `Low mood risk ${score}/100`;
}

function formatBiasLabel(value?: BiasLean | string) {
  const bias = (value || "unknown").toLowerCase();
  if (bias === "state-owned") return "Bias: state-owned";
  if (bias === "mixed") return "Bias: mixed";
  if (bias === "left" || bias === "center" || bias === "right") return `Bias: ${bias}`;
  return "Bias: unknown";
}

function formatSourceLaneLabel(value?: SourceLane | string) {
  const lane = (value || "portal").toLowerCase();
  if (lane === "official") return "Lane: official";
  if (lane === "agency") return "Lane: agency";
  if (lane === "regional") return "Lane: regional";
  if (lane === "social") return "Lane: social/viral";
  if (lane === "factcheck") return "Lane: fact-check";
  if (lane === "research") return "Lane: research";
  return "Lane: portal";
}

function inferBiasFromName(name: string): BiasLean {
  const text = name.toLowerCase();
  if (/pib|pmo|mea|prs|supreme court|election commission|government/.test(text)) return "state-owned";
  if (/alt news|boom|factly/.test(text)) return "center";
  if (/opindia/.test(text)) return "right";
  if (/wire|scroll/.test(text)) return "left";
  return "unknown";
}

function inferLaneFromSource(source: SignalSource | undefined, name: string): SourceLane {
  if (source?.sourceLane) return source.sourceLane;
  const text = `${name} ${source?.type ?? ""} ${source?.category ?? ""}`.toLowerCase();
  if (/pib|pmo|mea|prs|court|official|government/.test(text)) return "official";
  if (/pti|ani|reuters|associated press|ap news|agency/.test(text)) return "agency";
  if (/bhaskar|amar ujala|jagran|lokmat|eenadu|anandabazar|mathrubhumi|regional|hindi/.test(text)) return "regional";
  if (/x\.com|twitter|reddit|youtube|social|viral/.test(text)) return "social";
  if (/alt news|boom|factly|fact check/.test(text)) return "factcheck";
  if (/research/.test(text)) return "research";
  return "portal";
}

function sumBriefTokens(stories: EnrichedStory[]) {
  return stories.reduce((sum, story) => sum + (story.brief?.tokenUsage?.totalTokens ?? 0), 0);
}

function briefTokenLabel(brief: StoredStory["brief"]) {
  if (!brief) {
    return "No Gemini tokens yet";
  }

  if (brief.generatedBy === "template") {
    return "0 tokens - retry Gemini";
  }

  const total = brief.tokenUsage?.totalTokens;
  if (!total) {
    return "Tokens unavailable";
  }

  const prompt = brief.tokenUsage?.promptTokens;
  const output = brief.tokenUsage?.outputTokens;
  const detail = prompt || output ? ` (${formatTokens(prompt ?? 0)} in / ${formatTokens(output ?? 0)} out)` : "";
  return `${formatTokens(total)} tokens${detail}`;
}

function matchesStoryQuery(story: EnrichedStory, query: string) {
  const terms = normaliseSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return true;
  }

  const haystack = normaliseSearchText(storySearchText(story));
  return terms.every((term) => haystack.includes(term));
}

function storySearchText(story: EnrichedStory) {
  const brief = story.brief;
  return [
    story.title,
    story.summary,
    story.articleExcerpt || "",
    story.newsSnippet,
    story.whatHappenedShort,
    story.sourceName,
    story.sourceNames.join(" "),
    story.biasSummary,
    story.sourceLaneSummary,
    story.wireOrigin,
    story.verificationMethod,
    story.verificationState,
    story.sentimentLabel,
    story.scoringBreakdownLines.join(" "),
    story.tags.join(" "),
    story.topics.map((topic) => `${topic.label} ${topic.summary}`).join(" "),
    (story.sourceLinks ?? []).map((link) => `${link.sourceName} ${link.title} ${link.url} ${link.biasLean ?? ""} ${link.sourceLane ?? ""} ${link.verificationMethod ?? ""}`).join(" "),
    brief?.briefTitle || "",
    brief?.hook || "",
    brief?.whatHappened || "",
    brief?.whyItMatters || "",
    brief?.historicalContext || "",
    brief?.regionalContext || "",
    brief?.institutionalContext || "",
    brief?.powerAnalysis || "",
    (brief?.researchQuestions ?? []).join(" "),
    (brief?.dataPoints ?? []).join(" "),
    (brief?.sourcePositions ?? []).join(" "),
  ].join(" ");
}

function normaliseSearchText(value: string) {
  return cleanDisplayText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatTokens(value: number) {
  if (!value) {
    return "0";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return String(value);
}

function newestStoryTime(stories: EnrichedStory[]) {
  const newest = stories.reduce((max, story) => {
    const value = storyDateValue(story);
    return Math.max(max, value);
  }, 0);

  return newest || null;
}

function storyDateValue(story: StoredStory) {
  return dateValue(story.publishedAt || story.detectedAt);
}

function storyDisplayTime(story: StoredStory) {
  return story.publishedAt || story.detectedAt;
}

function nextScanLabel(run?: DashboardState["runs"][number]) {
  const base = run?.finishedAt || run?.startedAt;
  if (!base) {
    return "within 5 min";
  }

  const parsed = Date.parse(base);
  if (!Number.isFinite(parsed)) {
    return "within 5 min";
  }

  const next = parsed + 5 * 60 * 1000;
  const diffMinutes = Math.ceil((next - Date.now()) / 60000);
  if (diffMinutes <= 0) {
    return "any minute";
  }

  return `${diffMinutes} min`;
}

function freshnessLabel(value: number | null) {
  if (!value) {
    return "No successful signal yet";
  }

  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
  if (minutes < 60) {
    return `Fresh: latest signal ${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours <= 3) {
    return `Freshness watch: latest signal ${hours}h ago`;
  }

  return `STALE: latest signal ${hours}h ago`;
}

function freshnessShortLabel(value: number | null) {
  if (!value) {
    return "No signal";
  }

  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
  return minutes < 60 ? `${minutes}m fresh` : `${Math.round(minutes / 60)}h old`;
}

function todayDateInput() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function cleanSummary(summary: string, story: StoredStory, maxLength = 230) {
  const value = cleanDisplayText(summary);
  if (!value || /^\d{8}T?\d*/.test(value)) {
    return `A political signal was detected from ${story.sourceName}. Open the source trail and generate a brief before treating it as publishable.`;
  }

  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function cleanDisplayText(value: string) {
  return decodeDisplayEntities(decodeDisplayEntities(value || ""))
    .replace(/&nbsp;|&amp;nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDisplayEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCharCode(Number.parseInt(entity.slice(2), 16));
    }

    if (entity.startsWith("#")) {
      return String.fromCharCode(Number.parseInt(entity.slice(1), 10));
    }

    return named[entity.toLowerCase()] ?? `&${entity};`;
  });
}

function isOnOrAfterVisibleStartDate(story: StoredStory) {
  const value = story.publishedAt || story.detectedAt;
  const parsed = Date.parse(value);
  return !Number.isFinite(parsed) || parsed >= MIN_VISIBLE_STORY_DATE;
}

function isDisplayableStory(story: StoredStory) {
  const text = `${story.title} ${story.summary}`;
  if (/[\u0900-\u097f]/.test(text) || /[à¤à¥ÃÂâ]/.test(text)) {
    return false;
  }

  return /[a-z]/i.test(story.title);
}

function groupSources(sources: SignalSource[]): Array<[string, SignalSource[]]> {
  const groups = new Map<string, SignalSource[]>();
  sources.forEach((source) => {
    const key = source.category || "Other";
    groups.set(key, [...(groups.get(key) ?? []), source]);
  });

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function uniqueStoryLinks(links: StorySourceLink[]) {
  const seen = new Set<string>();
  const unique: StorySourceLink[] = [];
  for (const link of links) {
    const key = `${link.url}|${link.sourceName}`.toLowerCase();
    if (!link.url || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(link);
  }

  return unique;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(cleanDisplayText).filter(Boolean)));
}

function storyFromUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("story") ?? "";
}

function viewFromUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("view") ?? "";
}

function formatDateTime(value: string) {
  return `${new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value))} IST`;
}

function formatRelativeDate(value: string) {
  return formatDateTime(value).replace(", ", " ");
}

function dateValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
