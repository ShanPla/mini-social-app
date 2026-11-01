/*
 * Whether a nav link points at the page being shown. The path itself or
 * anything below it counts (/messages and /messages/<id>), but not a sibling
 * that merely shares a prefix: with to = /profile/<own id>, someone else's
 * /profile/<their id> does not light up Profile.
 */
export function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
