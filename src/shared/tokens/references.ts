const ALIAS_REFERENCE_PATTERN = /^\{([^}]+)\}$/;

export function parseAliasReference(rawValue: string): string | null {
  const match = rawValue.match(ALIAS_REFERENCE_PATTERN);
  if (!match) return null;
  return match[1].trim();
}

export function normalizeTokenPathForLookup(tokenPath: string): string {
  return tokenPath.trim().toLowerCase();
}
