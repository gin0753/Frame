export function apiOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const invalid = () =>
    new Error(
      'FRAME_API_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.',
    );
  if (
    !value ||
    value !== value.trim() ||
    !/^https?:\/\/[^/?#\\]+\/?$/i.test(value)
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (url.username || url.password) throw invalid();
  return url.origin;
}
