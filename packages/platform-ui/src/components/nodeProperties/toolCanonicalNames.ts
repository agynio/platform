const CANONICAL_TOOL_NAMES: Record<string, string> = {
  shellTool: 'shell_command',
  githubCloneRepoTool: 'github_clone_repo',
  sendSlackMessageTool: 'send_slack_message',
  sendMessageTool: 'send_message',
  finishTool: 'finish',
  callAgentTool: 'call_agent',
  manageTool: 'manage',
  memoryTool: 'memory',
  remindMeTool: 'remind_me',
} as const;

function normalizeTemplateName(template: string): string {
  const trimmed = template.trim();
  if (!trimmed) return '';
  const withoutSuffix = trimmed.replace(/Tool$/u, '').replace(/Node$/u, '');
  const snake = withoutSuffix
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return snake || trimmed.toLowerCase();
}

export function getCanonicalToolName(template?: string | null, fallback?: string | null): string {
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim();
  }
  if (typeof template === 'string' && template in CANONICAL_TOOL_NAMES) {
    return CANONICAL_TOOL_NAMES[template];
  }
  if (typeof template === 'string' && template.trim().length > 0) {
    return normalizeTemplateName(template);
  }
  return '';
}

export const canonicalToolNames = CANONICAL_TOOL_NAMES;
