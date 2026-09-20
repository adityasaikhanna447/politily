"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen, ChevronDown, Clock3, Copy, Download, FileText, Globe2, Info, LoaderCircle, Mail, Radio, RefreshCw, Search, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import type { DashboardState, PolitilyBrief, StoredStory } from "../lib/types";
import { cleanText, headline, istDate, storySummary, topicLabel } from "../lib/presentation";
import { groupIssues, linksForStory } from "../lib/grouping";
import { downloadArchive } from "../lib/archive-download";

type View = "radar" | "research" | "sources" | "delivery";
type Tab = "overview" | "sources" | "research" | "script";
const nav = [{ id: "radar", label: "Issue radar", icon: Radio }, { id: "research", label: "Research library", icon: BookOpen }, { id: "sources", label: "Source network", icon: Globe2 }, { id: "delivery", label: "Delivery", icon: Mail }] as const;
const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " IST" : "Not available";
const href = (value: string) => /^https?:\/\//i.test(value) ? value : "#";
const publishers = (story: StoredStory) => [...new Map(linksForStory(story).map(link => [link.sourceName.toLowerCase(), link])).values()];

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || result.message || `Request failed (${response.status})`), { code: result.code, retryAfter: Number(response.headers.get("Retry-After") || result.retryAfter || 60) });
  return result;
}

export function PolitilyDashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [view, setView] = useState<View>("radar");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All topics");
  const [sort, setSort] = useState("recent");
  const [period, setPeriod] = useState("24");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [now, setNow] = useState(0);
  const nextRefreshAt = useRef(0);

  const refresh = useCallback(async () => {
    try { const state = await api("/api/state"); setData(state); setError(""); nextRefreshAt.current = Date.now() + (state.service?.retryAfter || 60) * 1000; }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the newsroom"); const detail = e as { retryAfter?: number; code?: string }; nextRefreshAt.current = Date.now() + Math.max(detail.code === "DATABASE_SETUP" ? 5 : 60, Number(detail.retryAfter || 60)) * 1000; }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => { void refresh(); setNow(Date.now()); setDateFrom(istDate()); setDateTo(istDate());
      const params = new URLSearchParams(location.search);
      if (params.get("story")) { setSelected(params.get("story")); setMobileDetail(true); }
      if (params.get("view") === "brief") setTab("research");
    }, 0);
    const timer = setInterval(() => { setNow(Date.now()); if (!document.hidden && Date.now() >= nextRefreshAt.current) void refresh(); }, 5000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [refresh]);

  const issues = useMemo(() => groupIssues(data?.stories || []), [data]);
  const topics = useMemo(() => ["All topics", ...new Set(issues.map(topicLabel))], [issues]);
  const filtered = useMemo(() => issues.filter(story => {
    const content = cleanText(`${story.title} ${story.summary} ${story.tags.join(" ")} ${publishers(story).map(l => l.sourceName).join(" ")}`).toLowerCase();
    return (!query.trim() || query.toLowerCase().trim().split(/\s+/).every(word => content.includes(word))) &&
      (topic === "All topics" || topicLabel(story) === topic) &&
      (period === "all" || !now || now - Date.parse(story.publishedAt || story.detectedAt) <= Number(period) * 3600000) &&
      (view !== "research" || Boolean(story.brief));
  }).sort((a, b) => sort === "score" ? b.totalScore - a.totalScore : sort === "political" ? b.politicalWeight - a.politicalWeight : sort === "viral" ? b.viralPotential - a.viralPotential :
    (sort === "oldest" ? 1 : -1) * (Date.parse(a.publishedAt || a.detectedAt) - Date.parse(b.publishedAt || b.detectedAt))), [issues, query, topic, period, now, view, sort]);
  const active = issues.find(story => story.id === selected || story.sourceLinks?.some(link => link.storyId === selected)) || filtered[0];
  const lastScan = data?.runs.find(run => run.status === "complete" && run.scannedCount > 0);
  const healthy = !data?.service?.stale && lastScan?.finishedAt && now - Date.parse(lastScan.finishedAt) < 15 * 60000;
  const sourceCount = new Set(issues.flatMap(s => publishers(s).map(l => l.sourceName.toLowerCase()))).size;

  async function action(label: string, task: () => Promise<void>) {
    if (data?.service?.stale && !["Refreshing", "Copying"].includes(label)) { setError("Read-only snapshot: the database is unavailable. Restore D1 access before scanning, generating or sending."); return; }
    setBusy(label); setError(""); setNotice("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(""); }
  }
  function open(story: StoredStory, nextTab: Tab = "overview") {
    setSelected(story.id); setTab(nextTab); setMobileDetail(true);
    history.replaceState(null, "", `?story=${encodeURIComponent(story.id)}&view=${nextTab === "research" ? "brief" : "issue"}`);
  }
  async function generate(story?: StoredStory) {
    await action("Researching", async () => {
      const result = await api("/api/brief", story ? { storyId: story.id } : { query });
      if (result.state) setData(result.state);
      else setData(current => current ? { ...current, stories: [result.story, ...current.stories.filter(story => story.id !== result.story.id)] } : current);
      setSelected(result.story.id); setMobileDetail(true); setTab("research");
      setNotice("Research saved. Review the evidence and open questions before recording.");
    });
  }
  async function email(mode: "today" | "range" | "test") {
    await action("Sending", async () => {
      const result = await api(mode === "test" ? "/api/test-email" : "/api/email-digest", { mode, startDate: dateFrom, endDate: dateTo });
      if (result.sent === false) throw new Error(result.message);
      setNotice(result.message || "Email queued. Check Delivery and Resend for its status.");
      await refresh();
    });
  }
  async function exportData(format: "json" | "csv") {
    await action("Exporting archive", async () => setNotice(await downloadArchive(dateFrom, dateTo, format, setNotice)));
  }

  return <div className="app-shell">
    <aside className="rail">
      <button className="brand" onClick={() => { setView("radar"); setMobileDetail(false); }}><span className="brand-mark">P</span><span>Politily<small>THE RESEARCH DESK</small></span></button>
      <nav aria-label="Main navigation">{nav.map(item => <button key={item.id} className={view === item.id ? "nav-link active" : "nav-link"} onClick={() => { setView(item.id); setMobileDetail(false); }}><item.icon size={19}/><span>{item.label}</span>{item.id === "radar" && <small>{issues.length}</small>}</button>)}</nav>
      <div className="rail-bottom"><span className="edition-mark"><span className={healthy ? "dot green" : "dot amber"}/> {healthy ? "Radar connected" : "Check scan health"}</span><p>India &amp; the world<br/>A source-first perspective.</p><span className="version">NEWSROOM / 3.0</span></div>
    </aside>
    <div className="workspace">
      <header className="app-header"><button className="mobile-brand" title="Politily home" onClick={() => { setView("radar"); setMobileDetail(false); }}>P</button><form className="search" onSubmit={event => { event.preventDefault(); }}><Search size={18}/><input aria-label="Search issues or research a topic" placeholder="Search an issue, person or event" value={query} onChange={event => { setQuery(event.target.value); setMobileDetail(false); if (view === "sources" || view === "delivery") setView("radar"); }}/>{query && <button type="button" title="Clear search" onClick={() => setQuery("")}><X size={16}/></button>}</form>
        <div className="header-health" title={`Scan every 5 minutes. Last successful scan: ${time(lastScan?.finishedAt)}`}><span className={healthy ? "dot green" : "dot amber"}/><span>{healthy ? "Monitoring" : "Scan needs attention"}<small>{time(lastScan?.finishedAt)}</small></span></div>
        <button className="icon-button" title="Refresh dashboard" disabled={Boolean(busy)} onClick={() => void action("Refreshing", refresh)}><RefreshCw size={18}/></button>
        <button className="button primary scan-button" disabled={Boolean(busy)} onClick={() => void action("Scanning", async () => { const result = await api("/api/scan", {}); if (result.state) setData(result.state); else await refresh(); setNotice("Scan finished. Source failures are listed in Source network."); })}><Radio size={17}/><span>Scan now</span></button>
      </header>
      {(error || notice || data?.service?.stale || data?.demoMode) && <div className={`notice ${error || data?.service?.stale ? "error" : ""}`} role={error || data?.service?.stale ? "alert" : "status"}><Info size={18}/><span>{error || (data?.service?.stale ? `Read-only snapshot from ${time(data.service.snapshotAt)}. ${data.service.message}` : notice) || "Preview data only. Connect D1 before relying on this information."}</span><button title="Dismiss message" onClick={() => { setError(""); setNotice(""); }}><X size={16}/></button></div>}
      {busy && <div className="busy-strip" role="status"><LoaderCircle className="spin" size={15}/>{busy}...</div>}
      {!data && <div className="empty"><Radio size={32}/><h2>{error ? "The newsroom is unavailable" : "Connecting to the newsroom"}</h2><p>{error ? "Database access is required for live reporting and email. No sample news has been substituted. Check the error above and Cloudflare D1 usage." : "Loading issues, source health and delivery history."}</p><button className="button" onClick={() => void refresh()}>Retry connection</button>{error && <a className="text-button" href="/api/health" target="_blank" rel="noreferrer">Open connection diagnostics<ArrowUpRight size={15}/></a>}</div>}
      {data && (view === "radar" || view === "research") && <>
        <div className="page-heading"><div><p className="eyebrow">{view === "radar" ? "YOUR EDITORIAL WORKSPACE" : "SAVED INTELLIGENCE"}</p><h1>{view === "radar" ? "Issue radar" : "Research library"}<span>{filtered.length}</span></h1></div><div className="heading-meta"><Globe2 size={16}/>{sourceCount} publishers in loaded issues</div></div>
        <div className="filter-bar"><label className="select-wrap"><Clock3 size={16}/><select aria-label="Date range" value={period} onChange={event => setPeriod(event.target.value)}><option value="24">Past 24 hours</option><option value="168">Past 7 days</option><option value="all">All loaded issues</option></select></label><label className="select-wrap"><select aria-label="Sort issues" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recent first</option><option value="score">Highest priority</option><option value="oldest">Oldest first</option><option value="political">Political weight</option><option value="viral">Attention potential</option></select><ChevronDown size={15}/></label><div className="topic-select"><select aria-label="Topic filter" value={topic} onChange={event => setTopic(event.target.value)}>{topics.map(item => <option key={item}>{item}</option>)}</select></div></div>
        {query.trim() && <div className="research-query"><span>Research <b>{query}</b> beyond the loaded feed</span><button className="button" disabled={Boolean(busy) || !data.config.geminiReady} onClick={() => void generate()}><Sparkles size={15}/>Research topic<ArrowRight size={15}/></button></div>}
        <div className={`reading-layout ${mobileDetail ? "detail-open" : ""}`}>
          <section className="feed" aria-label="Grouped issues">{filtered.length ? filtered.map(story => <article key={story.id} className={`story-card ${active?.id === story.id ? "selected" : ""}`}>
            <div className="story-meta"><span className="topic-tag">{topicLabel(story)}</span><button className={`score ${story.totalScore >= data.config.alertThreshold ? "urgent" : ""}`} title="Open scoring breakdown" onClick={() => open(story)}>{story.totalScore}<small>/100</small></button></div>
            <button className="story-open" onClick={() => open(story)}><h2>{headline(story)}</h2><p>{storySummary(story) || "No substantive excerpt supplied. Open the source trail for the available reporting."}</p></button>
            <div className="publisher-row">{publishers(story).slice(0, 3).map(link => <a href={href(link.url)} key={link.url} target="_blank" rel="noreferrer">{cleanText(link.sourceName)}</a>)}{publishers(story).length > 3 && <button onClick={() => open(story, "sources")}>+{publishers(story).length - 3}</button>}</div>
            <div className="story-footer"><span>{story.publishedAt ? time(story.publishedAt) : `Detected ${time(story.detectedAt)}`}</span><button title="Open source trail" onClick={() => open(story, "sources")}><Globe2 size={13}/>{publishers(story).length}<ArrowUpRight size={13}/></button></div>
          </article>) : <div className="empty"><Search size={30}/><h2>No matching issues</h2><p>Change the time range or research this topic directly.</p><button className="button" onClick={() => { setPeriod("all"); setTopic("All topics"); setQuery(""); }}>Reset filters</button></div>}<p className="feed-end">{issues.length} grouped issues from the latest {data.stories.length} stored records.</p></section>
          <section className="reader" aria-label="Issue details">{active ? <>
            <div className="reader-top"><button className="back-button" onClick={() => setMobileDetail(false)}><ArrowLeft size={18}/>Radar</button><span>ISSUE FILE</span><span>{linksForStory(active).length} reports</span></div>
            <div className="reader-title"><span className="topic-tag">{topicLabel(active)}</span><h2>{headline(active)}</h2><div className="reader-byline"><Clock3 size={14}/>{time(active.publishedAt || active.detectedAt)}{!active.publishedAt && " (detected)"}</div></div>
            <div className="reader-actions"><button className="button primary" disabled={Boolean(busy) || !data.config.geminiReady} onClick={() => void generate(active)}><Sparkles size={16}/>{active.brief ? "Update research" : "Generate research"}</button><a className={`button ${!active.brief ? "disabled" : ""}`} href={active.brief ? `/api/export?storyId=${encodeURIComponent(active.id)}` : undefined} title="Export brief as Word document"><Download size={16}/>DOCX</a><a className="icon-button" href={href(active.url)} target="_blank" rel="noreferrer" title="Open original report"><ArrowUpRight size={18}/></a></div>
            <div className="reader-tabs" role="tablist">{([ ["overview", "Overview"], ["sources", "Sources"], ["research", "Research"], ["script", "Script"] ] as Array<[Tab, string]>).map(([id, label]) => <button role="tab" aria-selected={tab === id} key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "sources" && <small>{publishers(active).length}</small>}</button>)}</div>
            <div className="reader-body">{tab === "overview" && <>
              <section className="prose-section"><h3>What happened</h3><p className="lead-text">{storySummary(active) || "The source supplied no usable description. The linked report is the available evidence; a headline alone is not enough for a factual conclusion."}</p></section>
              <div className="evidence-note"><ShieldCheck size={18}/><div><strong>{active.brief?.evidenceGrade || "Reported, not verified"}</strong><p>{active.brief?.sourceConfidence || `${publishers(active).length} publishers in the source trail. Shared agency copy may not be independent corroboration.`}</p></div></div>
              <section className="prose-section"><h3>Editorial priority <span>{active.totalScore}/100</span></h3><div className="metrics">{[["Political weight", active.politicalWeight], ["Geopolitical", active.geopoliticalRelevance], ["Attention cues", active.viralPotential], ["Backlash cues", active.sentimentScore]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong><meter min="0" max="100" value={Number(value)}/></div>)}</div><details className="score-details"><summary>Why this score?<Info size={14}/></summary><p>{active.scoringBreakdown?.formula}</p><p><b>Political signals:</b> {active.scoringBreakdown?.politicalSignals?.join(", ") || "None identified"}</p><p><b>Geopolitical signals:</b> {active.scoringBreakdown?.geopoliticalSignals?.join(", ") || "None identified"}</p><p><b>Attention cues:</b> {active.scoringBreakdown?.viralSignals?.join(", ") || "None identified"}</p><p>{active.scoringBreakdown?.velocitySignal}</p><p>{active.scoringBreakdown?.sourceSignal}</p><p>Backlash cues are a language heuristic, not a public opinion survey.</p></details></section>
              <section className="prose-section"><h3>Reporting trail</h3><SourceTrail story={active} compact/><button className="text-button" onClick={() => setTab("sources")}>View all reports <ArrowRight size={15}/></button></section>
            </>}
            {tab === "sources" && <><h3 className="section-label">{publishers(active).length} publishers / {linksForStory(active).length} reports</h3><SourceTrail story={active}/></>}
            {tab === "research" && <Research story={active}/>}
            {tab === "script" && <><div className="section-heading"><h3>Roman Hindi master script</h3><button className="icon-button" title="Copy script" disabled={!active.brief?.videoScript} onClick={() => void action("Copying", async () => { await navigator.clipboard.writeText(active.brief?.videoScript || ""); setNotice("Script copied."); })}><Copy size={17}/></button></div>{active.brief?.videoScript ? <div className="script-text">{active.brief.videoScript}</div> : <div className="empty"><FileText size={28}/><h3>No script yet</h3><p>Generate research for this issue first.</p></div>}</>}
            </div>
            <div className="reader-bottom"><span><Sparkles size={13}/>{active.brief?.tokenUsage?.totalTokens?.toLocaleString() || "0"} recorded Gemini tokens</span><span>{active.brief ? "Research saved" : "No brief generated"}</span></div>
          </> : <div className="empty"><BookOpen size={32}/><h2>Your next story starts here</h2><p>Select an issue to assess its sources and context.</p></div>}</section>
        </div>
      </>}
      {data && view === "sources" && <div className="full-page"><div className="page-heading"><div><p className="eyebrow">COVERAGE &amp; PROVENANCE</p><h1>Source network</h1></div><span className="heading-meta">{data.sources.filter(s => s.active).length} enabled feeds</span></div><p className="page-note">Feeds are rotated every 5 minutes. A configured feed is not proof of successful coverage. Agency syndication is not independent confirmation.</p><div className="source-table"><div className="source-table-head"><span>Source / coverage</span><span>Language / lane</span><span>Last successful fetch</span><span>Health</span></div>{data.sources.map(source => <div className="source-table-row" key={source.id}><div><a href={href(source.url)} target="_blank" rel="noreferrer">{source.name}<ArrowUpRight size={13}/></a><small>{source.category}</small></div><div>{source.language || "Unknown"}<small>{source.sourceLane || source.type}</small></div><div>{time(source.lastSuccessAt)}<small>{source.lastSignalCount ?? 0} usable reports at last check</small></div><div><span className={`status-badge ${source.lastError ? "bad" : source.lastSuccessAt ? "good" : ""}`}>{!source.active ? "Paused" : source.lastError ? "Needs attention" : source.lastSuccessAt ? "Fetched" : "Not checked"}</span>{source.lastError && <small className="failure-text">{source.lastError}</small>}</div></div>)}</div><section className="prose-section"><h3>Recent scans</h3>{data.runs.map(run => <div className="log-row" key={run.id}><span className={`status-badge ${run.status === "failed" ? "bad" : ""}`}>{run.status}</span><div><strong>{time(run.startedAt)}</strong><p>{run.scannedCount} fetched / {run.createdCount} new / {run.emailedCount} accepted alerts</p><small>{run.message}</small></div></div>)}</section></div>}
      {data && view === "delivery" && <div className="full-page"><div className="page-heading"><div><p className="eyebrow">YOUR DAILY EDITORIAL BRIEFING</p><h1>Delivery</h1></div><button className="button" disabled={Boolean(busy)} onClick={() => void email("test")}><Send size={16}/>Send test</button></div>
        <div className="delivery-summary"><div><Mail size={23}/><h2>Two daily editions</h2><p><b>2:00 PM</b> &amp; <b>9:00 PM IST</b></p><small>Topic-grouped India and world newsletter.</small></div><div><Bell size={23}/><h2>Priority alerts</h2><p><b>{data.config.alertThreshold}+</b> immediate after capture</p><small>Up to five qualifying priority picks by 8 PM, plus urgent alerts. Fewer if credible fresh candidates are unavailable.</small></div><div><ShieldCheck size={23}/><h2>Connection</h2><p className={data.config.emailReady ? "good-text" : "bad-text"}>{data.config.emailReady ? "Settings configured" : "Settings missing"}</p><small>API key, sender and recipient must be set. Configuration alone does not confirm delivery.</small></div></div>
        <section className="send-edition"><div><h2>Send an edition now</h2><p>Stored reporting and saved analysis. No Gemini call.</p></div><div className="date-fields"><label>From<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label><label>To<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/></label><button className="button primary" disabled={Boolean(busy) || !dateFrom || !dateTo || dateFrom > dateTo} onClick={() => void email("range")}><Send size={16}/>Send edition</button><button className="button" disabled={Boolean(busy)} onClick={() => void email("today")}>Today so far</button></div></section>
        <section className="send-edition"><div><h2>Download your data</h2><p>Captured reports for the dates selected above, plus their issue context and saved briefs. Up to 31 days per download. Exporting does not delete anything.</p></div><div className="date-fields"><button className="button" disabled={Boolean(busy) || !dateFrom || !dateTo || dateFrom > dateTo} onClick={() => void exportData("json")}><Download size={16}/>Full archive (JSON)</button><button className="button" disabled={Boolean(busy) || !dateFrom || !dateTo || dateFrom > dateTo} onClick={() => void exportData("csv")}><Download size={16}/>Issues spreadsheet (CSV)</button></div></section>
        <section className="prose-section"><div className="section-heading"><h2>Delivery activity</h2><span className="heading-meta">Accepted is not inbox-confirmed</span></div>{data.deliveries?.length ? data.deliveries.map((job, index) => <article className="log-row" key={String(job.id || index)}><span className={`status-badge ${job.status === "accepted" ? "good" : job.status === "failed" || job.status === "expired" ? "bad" : ""}`}>{String(job.status)}</span><div><strong>{String(job.subject)}</strong><p>{time(String(job.created_at))} / {String(job.kind)} / {String(job.attempts)} attempts</p>{Boolean(job.last_error) && <p className="failure-text">{String(job.last_error)}</p>}{Boolean(job.provider_id) && <small>Resend ID: {String(job.provider_id)}</small>}</div></article>) : <div className="empty"><Mail size={28}/><h3>No delivery attempts recorded</h3><p>Send a test. After deployment, cron jobs should create entries here even when a send fails.</p></div>}</section>
        <p className="page-note">Open Resend &gt; Emails to check delivery, rejection or bounce events. D1 quota exhaustion stops both ingestion and the durable mail queue; existing stored data is not deleted.</p>
      </div>}
    </div>
  </div>;
}

function SourceTrail({ story, compact = false }: { story: StoredStory; compact?: boolean }) {
  const links = linksForStory(story);
  return <div className="source-trail">{story.sourceLinksTruncated && <p className="page-note">Latest 25 reports per stored issue are loaded here. Older citations remain in the database; these counts describe the loaded trail, not all-time coverage.</p>}{(compact ? links.slice(0, 3) : links).map((link, index) => <article key={link.url}><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div><div className="source-caption"><b>{cleanText(link.sourceName)}</b><span>{link.sourceLane || "portal"}</span></div><a href={href(link.url)} target="_blank" rel="noreferrer">{cleanText(link.title)}<ArrowUpRight size={14}/></a><small>{time(link.publishedAt)}{!compact && ` / Bias label: ${link.biasLean || "unknown"} (not a fact rating)`}</small>{!compact && <p>{link.verificationMethod || "Cross-check claims against original documents. No independent verification recorded."}</p>}</div></article>)}</div>;
}

function Research({ story }: { story: StoredStory }) {
  const brief = story.brief;
  if (!brief) return <div className="empty"><Sparkles size={28}/><h3>No research brief yet</h3><p>Generate a brief to investigate the timeline, actors, evidence and unanswered questions.</p></div>;
  const sections: Array<[keyof PolitilyBrief, string]> = [["whatHappened", "What happened"], ["whyItMatters", "Why it matters"], ["masterScriptQuestions", "Questions this story answers"], ["factsAndFigures", "Facts and figures"], ["dataPoints", "Data points"], ["timeline", "The timeline"], ["historicalContext", "Historical context"], ["geographicalContext", "Geographical context"], ["regionalContext", "Regional context"], ["keyPeople", "Key people"], ["institutionalContext", "Institutional accountability"], ["accountabilityMap", "Who is accountable"], ["stakeholderMap", "Stakeholders"], ["powerAnalysis", "Power and incentives"], ["claimMatrix", "Claims and evidence"], ["sourcePositions", "Source perspectives"], ["counterArguments", "Counterarguments"], ["missingEvidence", "Missing evidence"], ["researchQuestions", "Further questions"], ["openQuestions", "Still unanswered"], ["primaryDocuments", "Primary documents"], ["verificationProtocol", "Verification checklist"], ["noVideoUntil", "Before publishing"], ["narratives", "Competing narratives"], ["masterScriptOutline", "Story structure"], ["storytellingBeats", "Storytelling beats"], ["steppsStrategy", "STEPPS strategy"], ["videoAngles", "Video angles"], ["scriptConclusion", "Conclusion"], ["whatHappensNext", "What happens next"], ["monitoringQueries", "Keep watching"]];
  return <><div className="brief-intro"><span className="topic-tag">{brief.evidenceGrade}</span><h2>{cleanText(brief.briefTitle)}</h2><p>{cleanText(brief.hook)}</p><small>{brief.generatedBy === "gemini" ? "AI-assisted research" : "Template brief, not deep research"} / {time(brief.generatedAt)}</small></div>{story.publishedAt && Date.parse(story.publishedAt) > Date.parse(brief.generatedAt) && <div className="evidence-note caution"><Clock3 size={18}/><p>New reporting arrived after this brief was generated. Update the research before using it for the latest development.</p></div>}{brief.caution && <div className="evidence-note caution"><Info size={18}/><p>{brief.caution}</p></div>}{sections.map(([key, label]) => {
    const value = brief[key];
    if (!value || Array.isArray(value) && !value.length) return null;
    return <section className="prose-section" key={key}><h3>{label}</h3>{Array.isArray(value) ? <ul>{value.map((item, i) => <li key={i}>{cleanText(String(item))}</li>)}</ul> : <p>{cleanText(String(value))}</p>}</section>;
  })}<section className="prose-section"><h3>Cited sources</h3>{brief.citedUrls.map((url, index) => <a className="citation" href={href(url)} target="_blank" rel="noreferrer" key={url}>[{index + 1}] {url}<ArrowUpRight size={14}/></a>)}</section></>;
}
