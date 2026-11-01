import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { tokenizeMentions, mentionedUsernames } from '../../lib/mentions';
import { cachedProfileId, requestProfileIds } from '../../lib/mentionCache';
import './MentionText.css';

/*
 * Text with its @mentions turned into profile links. Names that belong to
 * nobody stay plain text. Always rendered as React nodes, never as HTML.
 */
export default function MentionText({ text }: { text: string }) {
  const parts = useMemo(() => tokenizeMentions(text), [text]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const names = mentionedUsernames(text);
    if (names.length === 0) return;
    return requestProfileIds(names, () => setTick((t) => t + 1));
  }, [text]);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') return part.text;
        const id = cachedProfileId(part.username);
        return id
          ? <Link key={i} to={`/profile/${id}`} className="mention-link">{part.text}</Link>
          : part.text;
      })}
    </>
  );
}
