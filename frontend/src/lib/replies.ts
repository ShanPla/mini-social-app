/* Short text for a quoted or replied-to message: its first line, or "Photo" */
export function replyPreview(content: string | null | undefined, imageUrl: string | null | undefined): string {
  const firstLine = (content ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (firstLine) return firstLine;
  return imageUrl ? 'Photo' : '';
}
