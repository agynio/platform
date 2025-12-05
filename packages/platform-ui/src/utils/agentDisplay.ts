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

type AgentProfileConfig = {
  title?: string | null;
  name?: string | null;
  role?: string | null;
} | undefined;

export const resolveAgentDisplayTitle = (config: AgentProfileConfig): string => {
  const rawTitle = typeof config?.title === 'string' ? config.title.trim() : '';
  if (rawTitle.length > 0) {
    return rawTitle;
  }

  return computeAgentDefaultTitle(config?.name, config?.role, 'Agent');
};

export const AGENT_TITLE_FALLBACK = FALLBACK_AGENT_DISPLAY;
