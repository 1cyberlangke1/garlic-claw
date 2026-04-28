export function sanitizeModelToolCallName(toolName: string): string {
  return toolName
    .trim()
    .replace(/<\|channel\|>(?:[a-zA-Z0-9_-]+)?/gu, '')
    .trim();
}

export function resolveKnownModelToolCallName(
  toolName: string,
  availableToolNames: Iterable<string>,
): string | null {
  const directName = toolName.trim();
  if (directName.length === 0) {
    return null;
  }
  const knownToolNames = new Set(availableToolNames);
  if (knownToolNames.has(directName)) {
    return directName;
  }
  const sanitizedName = sanitizeModelToolCallName(directName);
  if (sanitizedName.length > 0 && knownToolNames.has(sanitizedName)) {
    return sanitizedName;
  }
  return resolveShellToolAlias(sanitizedName || directName, knownToolNames);
}

function resolveShellToolAlias(
  toolName: string,
  knownToolNames: Set<string>,
): string | null {
  const normalized = toolName.trim().toLowerCase();
  if (normalized === 'bash' && knownToolNames.has('powershell')) {
    return 'powershell';
  }
  if (normalized === 'powershell' && knownToolNames.has('bash')) {
    return 'bash';
  }
  return null;
}
