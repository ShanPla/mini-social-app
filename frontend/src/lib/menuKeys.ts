/*
 * Arrow keys, Home and End move focus between the items of an open menu or
 * list. Returns true when it handled the key.
 */
export function moveFocus(container: HTMLElement | null, key: string, selector: string): boolean {
  if (!container) return false;
  const items = [...container.querySelectorAll<HTMLElement>(selector)];
  if (items.length === 0) return false;
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % items.length;
  else if (key === 'ArrowUp') next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = items.length - 1;
  else return false;
  items[next].focus();
  return true;
}
