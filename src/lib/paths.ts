/** Prefix a site-relative path with the configured base ("/japanese-word-of-the-day"). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
