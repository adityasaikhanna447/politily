"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState, SignalSource, StoredStory, StorySourceLink } from "../lib/types";
import { getDemoState } from "../lib/demo-data";

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
  sourcePriority: number | null;
  videoAngle: string;
  verificationState: string;
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
    keywords: ["parliament", "lok sabha", "rajya sabha", "bill", "ordinance", "committee", "policy", "regulation"],
    summary: "Bills, policy changes, legislative conflict, committee work, and governance decisions that need document-led explainers.",
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
    keywords: ["bjp", "congress", "aap", "tmc", "dmk", "rjd", "jdu", "alliance", "opposition", "defection", "coalition", "star campaigner"],
    summary: "Party strategy, statements, alliances, defections, attack lines, and narrative competition.",
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    keywords: ["foreign", "border", "china", "pakistan", "summit", "treaty", "sanction", "diplomacy", "united nations", "brics"],
    summary: "Foreign policy, border, diplomacy, sanctions, and international reaction that need India-first context.",
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
    method: "Looks for institutions, parties, elections, courts, policy, ministers, opposition, and governance terms.",
  },
  geopoliticalRelevance: {
    label: "Geo relevance",
    method: "Looks for border, diplomacy, foreign affairs, sanctions, China, Pakistan, UN, BRICS, and global reaction terms.",
  },
  viralPotential: {
    label: "Viral potential",
    method: "Looks for conflict, bans, arrests, protests, corruption, public-order risk, identity issues, numbers, and headline tension.",
  },
};

const MIN_VISIBLE_STORY_DATE = Date.parse("2026-07-20T00:00:00+05:30");
const MIN_VISIBLE_STORY_LABEL = "20 Jul 2026";

export function PolitilyDashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("watch");
  const [status, setStatus] = useState("Connecting to Politily");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [scoreFocus, setScoreFocus] = useState<ScoreKey>("viralPotential");

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
    setStatus("Generating English brief and Hindi script");
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
  const triggeredCount = enrichedStories.filter((story) => story.totalScore >= (state?.config.threshold ?? 72)).length;
  const briefedCount = enrichedStories.filter((story) => story.brief).length;
  const tokenTotal = sumBriefTokens(enrichedStories);

  const filteredStories = useMemo(() => {
    const cleanedQuery = query.trim().toLowerCase();
    return enrichedStories
      .filter((story) => {
        const haystack = `${story.title} ${story.summary} ${story.sourceName} ${story.tags.join(" ")} ${story.topics.map((topic) => topic.label).join(" ")}`.toLowerCase();
        const matchesQuery = !cleanedQuery || haystack.includes(cleanedQuery);
        const matchesTopic =
          selectedTopic === "all" ||
          story.topics.some((topic) => topic.id === selectedTopic) ||
          story.tags.some((tag) => tag.toLowerCase().includes(selectedTopic));
        return matchesQuery && matchesTopic;
      })
      .sort((left, right) => compareStories(left, right, sortKey));
  }, [enrichedStories, query, selectedTopic, sortKey]);

  const selectedStory =
    filteredStories.find((story) => story.id === selectedId) ?? filteredStories[0] ?? enrichedStories[0];

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
          placeholder="Search issue, party, state, court, source"
          value={query}
        />
        <div className="top-actions">
          <div className="crawl-chip">
            <span>Last scan</span>
            <strong>{latestRun ? formatDateTime(latestRun.finishedAt || latestRun.startedAt) : "Waiting"}</strong>
          </div>
          <div className="score-chip portal-chip">
            <strong>{portalNames.length}</strong>
            <span>Portals since {MIN_VISIBLE_STORY_LABEL}</span>
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
        <div className="system-note">
          <span>{status}. Showing news from {MIN_VISIBLE_STORY_LABEL} onward.</span>
          <strong>
            {portalNames.length} portals cited in visible stories. D1 tables: 4 normal tables.
          </strong>
        </div>

        <div className="mobile-news-summary">
          <span>Since {MIN_VISIBLE_STORY_LABEL}</span>
          <strong>{enrichedStories.length} signals</strong>
          <strong>{portalNames.length} portals</strong>
          <strong>{formatTokens(tokenTotal)} tokens</strong>
        </div>

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
            onScoreFocus={setScoreFocus}
            onSelect={setSelectedId}
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
        {view === "setup" && state ? <SetupDesk state={state} latestRun={latestRun} /> : null}
      </section>

      {selectedStory ? (
        <SelectedStoryFooter
          busy={busy}
          onGenerate={generateBrief}
          onOpenBrief={() => setView("brief")}
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
        <section className={`panel lead-story span-2 ${leadStory.imageUrl ? "" : "no-media"}`}>
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
          {leadStory.imageUrl ? <StoryImage story={leadStory} variant="hero" /> : null}
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
          <StrategyRow label="Script language" value="Research in English, creator script in Hindi." />
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
              {story.imageUrl ? <StoryImage story={story} variant="mini" /> : null}
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
  sortKey,
  setSortKey,
  setSelectedTopic,
  scoreFocus,
  onScoreFocus,
  onSelect,
  busy,
  onGenerate,
}: {
  stories: EnrichedStory[];
  selectedStory?: EnrichedStory;
  selectedTopic: string;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  setSelectedTopic: (value: string) => void;
  scoreFocus: ScoreKey;
  onScoreFocus: (value: ScoreKey) => void;
  onSelect: (id: string) => void;
  busy: boolean;
  onGenerate: (storyId: string) => void;
}) {
  const clusters = useMemo(() => buildIssueClusters(stories), [stories]);
  const selectedCluster = selectedStory
    ? clusters.find((cluster) => cluster.stories.some((story) => story.id === selectedStory.id))
    : clusters[0];

  return (
    <div className="watch-grid">
      <section className="panel feed-panel">
        <div className="feed-tools">
          <PanelTitle title="Issue radar" />
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
        <div className="story-feed issue-feed">
          {clusters.map((cluster) => (
            <IssueClusterCard
              active={cluster.id === selectedCluster?.id}
              cluster={cluster}
              key={cluster.id}
              onSelect={onSelect}
            />
          ))}
          {!clusters.length ? <div className="empty-state">No issue clusters match this search or topic filter.</div> : null}
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
    <button className={`story-post issue-card ${active ? "active" : ""}`} onClick={() => onSelect(lead.id)} type="button">
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
      {lead.imageUrl ? <StoryImage story={lead} variant="thumb" /> : null}
      <div className="story-post-body">
        <h3>{cluster.label}</h3>
        <p>{lead.newsSnippet}</p>
        <div className="issue-source-strip">
          {sourcePreview.map((source) => (
            <span key={source}>{source}</span>
          ))}
          {cluster.sources.length > sourcePreview.length ? <strong>+{cluster.sources.length - sourcePreview.length}</strong> : null}
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
        </div>
        <div className="post-signal-line">
          <strong>{evidence}</strong>
          <span>{briefState} - tap to inspect source proof</span>
        </div>
      </div>
    </button>
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

function StoryImage({ story, variant = "thumb" }: { story: EnrichedStory; variant?: "hero" | "thumb" | "mini" | "dossier" }) {
  const [failed, setFailed] = useState(false);
  const label = story.topics[0]?.label || "Politics";
  if (!story.imageUrl || failed) {
    return null;
  }

  return (
    <div className={`story-image story-image-${variant}`}>
      <img alt="" loading="lazy" onError={() => setFailed(true)} src={story.imageUrl} />
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
      <div className={`dossier-head ${story.imageUrl ? "" : "no-media"}`}>
        {story.imageUrl ? <StoryImage story={story} variant="dossier" /> : null}
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
        <small>Priority formula: novelty 24%, political 31%, geo 20%, viral 25%.</small>
      </div>

      <div className="insight-grid">
        <ResearchTile label="Video angle" value={story.videoAngle} />
        <ResearchTile label="Verification state" value={story.verificationState} />
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
        <PanelTitle title="Brief and Hindi script" />
        <h2>No generated brief yet</h2>
        <p>Generate a brief to get English research context, source confidence, multiple perspectives, and Hindi creator script.</p>
        <button className="btn btn-gold" disabled={busy} onClick={() => onGenerate(story.id)} type="button">
          Generate brief
        </button>
      </section>
    );
  }

  return (
    <section className="brief-grid">
      <div className="panel span-2">
        <div className={`brief-story-context ${story.imageUrl ? "" : "no-media"}`}>
          {story.imageUrl ? <StoryImage story={story} variant="dossier" /> : null}
          <div>
            <span className="section-chip">Original signal</span>
            <strong>{story.title}</strong>
            <p>{story.newsSnippet}</p>
          </div>
        </div>
        <div className="brief-title-row">
          <div>
            <PanelTitle title="Brief and Hindi script" />
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
      <ListPanel title="Source positions" items={brief.sourcePositions ?? []} />
      <ListPanel title="Video angles" items={brief.videoAngles ?? []} />
      <ListPanel title="Claim matrix" items={brief.claimMatrix} />
      <ListPanel title="Verification protocol" items={brief.verificationProtocol} />
      <ListPanel title="What happens next" items={brief.whatHappensNext} />

      <div className="panel span-2">
        <PanelTitle title="Hindi creator script" />
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

function SetupDesk({ state, latestRun }: { state: DashboardState; latestRun: DashboardState["runs"][number] | undefined }) {
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
          <StrategyRow label="Cron" value="Cloudflare schedule runs every 15 minutes. Cloudflare UI shows UTC, app shows IST." />
        </div>
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
    sourcePriority: matchingSource?.priority ?? null,
    videoAngle: story.brief?.videoAngles?.[0] || videoAngleFor(story, topics),
    verificationState: verificationState(story, sourceNames.length),
  };
}

function deriveTopics(story: StoredStory) {
  const text = `${story.title} ${story.summary} ${story.sourceName} ${story.tags.join(" ")}`.toLowerCase();
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
    const label = source.category.split("/")[0].trim() || source.type;
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

function buildIssueClusters(stories: EnrichedStory[]) {
  const clusters: IssueCluster[] = [];
  const sorted = stories.slice().sort((left, right) => compareStories(left, right, "rank"));

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
      match.latestAt = dateValue(story.detectedAt) > dateValue(match.latestAt) ? story.detectedAt : match.latestAt;
      if (story.reachScore > match.lead.reachScore) {
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
      latestAt: story.detectedAt,
    });
  });

  return clusters.sort((left, right) => right.reachScore - left.reachScore || dateValue(right.latestAt) - dateValue(left.latestAt));
}

function issueKey(story: EnrichedStory) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  if (/cjp|cockroach janta party|chalo sansad|sansad chalo/.test(text)) {
    return "issue:cjp-sansad-chalo";
  }
  if (/bankipur|bypoll|by-election|byelection/.test(text)) {
    return "issue:bankipur-bypoll";
  }
  if (/jailed leaders|removing jailed leaders|130th constitutional|office.*jailed/.test(text)) {
    return "issue:jailed-leaders-bill";
  }
  if (/rahul gandhi/.test(text)) {
    return "issue:rahul-gandhi";
  }

  const topic = story.topics[0]?.id || "politics";
  const keywords = issueTokens(story.title).slice(0, 5).join("-");
  return `${topic}:${keywords || story.fingerprint}`;
}

function issueLabel(story: EnrichedStory) {
  const text = `${story.title} ${story.summary}`.toLowerCase();
  if (/cjp|cockroach janta party|chalo sansad|sansad chalo/.test(text)) {
    return "CJP / Sansad Chalo protest";
  }
  if (/bankipur|bypoll|by-election|byelection/.test(text)) {
    return "Bankipur bypoll and Bihar party strategy";
  }
  if (/jailed leaders|removing jailed leaders/.test(text)) {
    return "Bill on jailed leaders holding office";
  }

  return removeSourceSuffix(story.title);
}

function storyIssueSimilarity(left: EnrichedStory, right: EnrichedStory) {
  const leftTokens = new Set(issueTokens(left.title));
  const rightTokens = new Set(issueTokens(right.title));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function issueTokens(value: string) {
  const stopWords = new Set([
    "about",
    "after",
    "against",
    "amid",
    "and",
    "are",
    "from",
    "have",
    "india",
    "indian",
    "into",
    "news",
    "over",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "with",
    "why",
  ]);

  return cleanDisplayText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stopWords.has(token));
}

function removeSourceSuffix(value: string) {
  return cleanDisplayText(value).replace(/\s+-\s+[^-]{2,40}$/g, "");
}

function compareStories(left: EnrichedStory, right: EnrichedStory, sortKey: SortKey) {
  if (sortKey === "recent") {
    return dateValue(right.detectedAt) - dateValue(left.detectedAt);
  }
  if (sortKey === "oldest") {
    return dateValue(left.detectedAt) - dateValue(right.detectedAt);
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

  return right.reachScore - left.reachScore || right.totalScore - left.totalScore;
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

function formatTokens(value: number) {
  if (!value) {
    return "0";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return String(value);
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
