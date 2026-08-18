// Display form of a URL. The stored value is never modified: this only
// decides what the list shows, so the useful part (the domain and the
// path) gets the column width instead of "https://www.".

/**
 * Drops the scheme, a leading `www.` and a lone trailing slash.
 * Path, query and fragment are kept — they identify the resource.
 */
export function shortUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let rest = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  rest = rest.replace(/^www\./i, "");
  // Only when the slash is the whole path: "site.com/" but not "site.com/a/".
  rest = rest.replace(/^([^/?#]+)\/$/, "$1");

  return rest || trimmed;
}
