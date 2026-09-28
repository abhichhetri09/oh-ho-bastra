/** Where to send someone after sign-in: `?next=` if it's a same-site path, else the fallback. */
export function safeNext(search: string, fallback = "/account") {
  const next = new URLSearchParams(search).get("next");
  // Only same-origin paths ("/x"), never "//evil.com" or absolute URLs.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function signInPath(returnTo: string) {
  return `/sign-in?next=${encodeURIComponent(returnTo)}`;
}
