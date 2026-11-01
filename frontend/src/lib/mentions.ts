/*
 * @mentions, mirrored from extract_mentions in schema.sql: the name is 3 to
 * 30 letters, digits or underscores, and must not touch a letter, digit or
 * underscore on either side (so an e-mail address is not a mention).
 * Pure helpers only; the lookup of names to people is in mentionCache.ts.
 */

export const MENTION_MAX_LENGTH = 30;

const WORD = /[a-zA-Z0-9_]/;

export type TextPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; username: string };

/* Splits text into plain runs and @mention tokens (username lowercased) */
export function tokenizeMentions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const atIndex = m.index + m[1].length;
    if (atIndex > last) parts.push({ type: 'text', text: text.slice(last, atIndex) });
    parts.push({ type: 'mention', text: `@${m[2]}`, username: m[2].toLowerCase() });
    last = atIndex + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

/* Distinct lowercase usernames mentioned in a text, in order */
export function mentionedUsernames(text: string): string[] {
  const names: string[] = [];
  for (const part of tokenizeMentions(text)) {
    if (part.type === 'mention' && !names.includes(part.username)) names.push(part.username);
  }
  return names;
}

export type MentionQuery = {
  /* Index of the @ */
  start: number;
  /* What was typed after it, up to the caret (1 to 30 characters) */
  query: string;
};

/*
 * The mention being typed right at the caret, if any: an @ that starts the
 * text or follows a non-word character, then 1 or more name characters
 * running up to the caret. Nothing after the caret matters.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  let i = caret;
  while (i > 0 && WORD.test(text[i - 1])) i -= 1;
  if (i === 0 || text[i - 1] !== '@') return null;
  const start = i - 1;
  if (start > 0 && WORD.test(text[start - 1])) return null;
  const query = text.slice(i, caret);
  if (query.length < 1 || query.length > MENTION_MAX_LENGTH) return null;
  return { start, query };
}

/* Replaces the typed @query with @username and a space. Returns the new text and caret. */
export function insertMention(text: string, caret: number, start: number, username: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const inserted = `@${username} `;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
