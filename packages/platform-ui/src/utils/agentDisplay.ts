const FALLBACK_AGENT_DISPLAY = '(unknown agent)';

export const normalizeAgentName = (rawName?: string | null): string | undefined => {
  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
};

export const normalizeAgentRole = (rawRole?: string | null): string | undefined => {
  const trimmed = typeof rawRole === 'string' ? rawRole.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
};

export const computeAgentDefaultTitle = (
  rawName?: string | null,
  rawRole?: string | null,
  fallback: string = FALLBACK_AGENT_DISPLAY,
): string => {
  const name = normalizeAgentName(rawName);
  const role = normalizeAgentRole(rawRole);
  if (name && role) return `${name} (${role})`;
  if (name) return name;
  if (role) return role;
  return fallback;
};

export const AGENT_TITLE_FALLBACK = FALLBACK_AGENT_DISPLAY;
