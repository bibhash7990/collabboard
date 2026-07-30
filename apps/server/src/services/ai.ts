import { nanoid } from 'nanoid';
import type { ActionItem, GenerateActionItemsResponse } from '@collabboard/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';

const MODEL = 'mock-llm-v1';

/**
 * "AI" action-item extraction. If AI_SERVICE_URL is configured we POST the notes
 * to that external (mock) LLM service; otherwise we run a deterministic in-process
 * extractor so the feature works with zero external dependencies. The assignment
 * explicitly allows mocking the LLM — this keeps the contract real while remaining
 * offline-friendly and testable.
 */
export async function generateActionItems(text: string): Promise<GenerateActionItemsResponse> {
  const generatedAt = new Date().toISOString();
  if (env.AI_SERVICE_URL) {
    try {
      const res = await fetch(`${env.AI_SERVICE_URL.replace(/\/$/, '')}/action-items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: ActionItem[]; model?: string };
        return { items: data.items ?? [], model: data.model ?? 'external-llm', generatedAt };
      }
      logger.warn({ status: res.status }, 'AI service non-200, falling back to mock');
    } catch (err) {
      logger.warn({ err }, 'AI service unreachable, falling back to mock');
    }
  }
  return { items: extractActionItems(text), model: MODEL, generatedAt };
}

const DATE_RE =
  /\bby\s+(the\s+)?(eod|today|tomorrow|end of (day|week)|next\s+week|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|\d{4}-\d{2}-\d{2}|\d{1,2}(st|nd|rd|th)?\s+\w+)/i;
const OWNER_RE = /@([a-z0-9_.-]+)/i;
const NAME_LEAD_RE = /^([A-Z][a-z]+)\s+(?:will|to|should|is going to|needs to|owns)\b/;
const ACTION_RE =
  /(\bTODO\b|\baction item\b|\baction:\b|\bfollow[-\s]?up\b|\bwill\b|\bshould\b|\bneed(s)? to\b|\bmust\b|\bassign(ed)?\b|\bresponsible\b|\btake(s)? ownership\b|\bnext step\b|\bwe(?:'|\s+wi)ll\b)/i;
const CHECKBOX_RE = /^\s*(?:[-*]\s*)?\[\s?\]\s*/;

/**
 * Deterministic heuristic: a line is an action item if it's a checkbox, or it
 * contains an action cue (verb/keyword). Owner comes from @mention or a leading
 * "Name will…"; due date from a "by <when>" clause. Confidence scales with signals.
 */
export function extractActionItems(text: string): ActionItem[] {
  const lines = text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z@\-*\[])/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const items: ActionItem[] = [];
  for (const raw of lines) {
    const isCheckbox = CHECKBOX_RE.test(raw);
    const hasAction = ACTION_RE.test(raw);
    if (!isCheckbox && !hasAction) continue;

    const clean = raw.replace(CHECKBOX_RE, '').trim();
    if (clean.length < 3) continue;

    const ownerMention = OWNER_RE.exec(clean);
    const ownerLead = NAME_LEAD_RE.exec(clean);
    const owner = ownerMention?.[1] ?? ownerLead?.[1] ?? null;

    const dueMatch = DATE_RE.exec(clean);
    const due = dueMatch ? dueMatch[0].replace(/^by\s+/i, '').trim() : null;

    let confidence = 0.55;
    if (isCheckbox) confidence += 0.25;
    if (hasAction) confidence += 0.1;
    if (owner) confidence += 0.1;
    if (due) confidence += 0.1;

    items.push({
      id: nanoid(10),
      text: clean.replace(/\s+/g, ' '),
      owner,
      due,
      confidence: Math.min(0.98, Number(confidence.toFixed(2))),
    });
  }

  // De-dupe near-identical items, keep the highest-confidence variant.
  const seen = new Map<string, ActionItem>();
  for (const it of items) {
    const key = it.text.toLowerCase().slice(0, 60);
    const prev = seen.get(key);
    if (!prev || it.confidence > prev.confidence) seen.set(key, it);
  }
  return [...seen.values()].slice(0, 25);
}
