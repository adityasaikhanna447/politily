import type { StoredStory, StorySourceLink } from "./types";
import { areSameIssue } from "./issues";

export function linksForStory(story: StoredStory): StorySourceLink[] {
  const links = [{ id: story.id, storyId: story.id, title: story.title, url: story.url,
    sourceName: story.sourceName, publishedAt: story.publishedAt }, ...(story.sourceLinks || [])];
  return [...new Map(links.filter(link => /^https?:\/\//i.test(link.url)).map(link => [link.url, link])).values()];
}

export function groupIssues(stories: StoredStory[]) {
  const groups: StoredStory[] = [];
  for (const story of [...stories].sort((a, b) => Date.parse(b.publishedAt || b.detectedAt) - Date.parse(a.publishedAt || a.detectedAt))) {
    const match = groups.find(item => areSameIssue(item, story) &&
      Math.abs(Date.parse(item.publishedAt || item.detectedAt) - Date.parse(story.publishedAt || story.detectedAt)) < 7 * 86400000);
    if (match) {
      match.sourceLinks = linksForStory({ ...match, sourceLinks: [...linksForStory(match), ...linksForStory(story)] });
      match.sourceLinksTruncated ||= story.sourceLinksTruncated;
      if (!match.brief && story.brief) { match.brief = story.brief; match.scriptText = story.scriptText; }
    } else groups.push({ ...story, sourceLinks: linksForStory(story) });
  }
  return groups;
}
