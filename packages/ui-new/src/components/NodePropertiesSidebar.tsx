import { Info, Play, Square, X, Trash2 } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { MarkdownInput } from './MarkdownInput';
import { Dropdown } from './Dropdown';
import { Button } from './Button';
import { Toggle } from './Toggle';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import Badge from './Badge';
import { IconButton } from './IconButton';
import { ReferenceInput } from './ReferenceInput';
import { BashInput } from './BashInput';
import { AutocompleteInput } from './AutocompleteInput';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ToolItem } from './ToolItem';

type NodeStatus = 
  | 'not_ready'
  | 'provisioning'
  | 'ready'
  | 'deprovisioning'
  | 'provisioning_error'
  | 'deprovisioning_error';

type NodeKind = 'Agent' | 'Tool' | 'MCP' | 'Trigger' | 'Workspace';

interface NodePropertiesSidebarProps {
  nodeKind: NodeKind;
  nodeTitle: string;
  status: NodeStatus;
  onSave?: (data: any) => void;
}

const statusConfig: Record<NodeStatus, { label: string; color: string; bgColor: string }> = {
  not_ready: { label: 'Not Ready', color: 'var(--agyn-gray)', bgColor: 'var(--agyn-bg-light)' },
  provisioning: { label: 'Provisioning', color: 'var(--agyn-status-running)', bgColor: 'var(--agyn-status-running-bg)' },
  ready: { label: 'Ready', color: 'var(--agyn-status-finished)', bgColor: 'var(--agyn-status-finished-bg)' },
  deprovisioning: { label: 'Deprovisioning', color: 'var(--agyn-status-pending)', bgColor: 'var(--agyn-status-pending-bg)' },
  provisioning_error: { label: 'Provisioning Error', color: 'var(--agyn-status-failed)', bgColor: 'var(--agyn-status-failed-bg)' },
  deprovisioning_error: { label: 'Deprovisioning Error', color: 'var(--agyn-status-failed)', bgColor: 'var(--agyn-status-failed-bg)' },
};

interface FieldLabelProps {
  label: string;
  hint?: string;
  required?: boolean;
}

function FieldLabel({ label, hint, required }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <label className="text-sm text-[var(--agyn-dark)]">
        {label}
        {required && <span className="text-[var(--agyn-status-failed)]">*</span>}
      </label>
      {hint && (
        <Tooltip>
          <TooltipTrigger className="cursor-help">
            <Info className="w-3.5 h-3.5 text-[var(--agyn-gray)]" />
          </TooltipTrigger>
          <TooltipContent className="text-xs">{hint}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function NodePropertiesSidebar({ 
  nodeKind, 
  nodeTitle, 
  status,
  onSave 
}: NodePropertiesSidebarProps) {
  const [requireToolCallToFinish, setRequireToolCallToFinish] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful assistant that provides accurate and concise information.'
  );
  
  // Trigger state
  const [appToken, setAppToken] = useState('');
  const [botToken, setBotToken] = useState('');

  // MCP state
  const [mcpNamespace, setMcpNamespace] = useState('my-mcp-server');
  const [mcpCommand, setMcpCommand] = useState('npx -y @modelcontextprotocol/server-everything');
  const [mcpWorkdir, setMcpWorkdir] = useState('');
  const [mcpRequestTimeout, setMcpRequestTimeout] = useState('60000');
  const [mcpStartupTimeout, setMcpStartupTimeout] = useState('30000');
  const [mcpHeartbeatInterval, setMcpHeartbeatInterval] = useState('10000');
  const [mcpStaleTimeout, setMcpStaleTimeout] = useState('30000');
  const [mcpRestartMaxAttempts, setMcpRestartMaxAttempts] = useState('3');
  const [mcpRestartBackoff, setMcpRestartBackoff] = useState('5000');
  const [mcpTools, setMcpTools] = useState([
    { name: 'get_weather', description: 'Get current weather for a location', enabled: true },
    { name: 'search_web', description: 'Search the web for information', enabled: true },
    { name: 'read_file', description: 'Read contents of a file', enabled: false },
    { name: 'write_file', description: 'Write content to a file', enabled: true },
    { name: 'execute_extremely_long_tool_name_that_should_be_truncated', description: 'This is a very long description that should wrap to multiple lines to demonstrate how the UI handles long text content in the tool description field', enabled: true },
  ]);
  const [mcpEnvVars, setMcpEnvVars] = useState<Array<{ name: string; value: string }>>([
    { name: 'API_KEY', value: '${{ secrets.OPENAI_API_KEY }}' },
  ]);

  // Workspace state
  const [workspaceImage, setWorkspaceImage] = useState('docker.io/library/ubuntu:latest');
  const [initialScript, setInitialScript] = useState('');
  const [platform, setPlatform] = useState('auto');
  const [enableDockerInDocker, setEnableDockerInDocker] = useState(false);
  const [enablePersistentVolume, setEnablePersistentVolume] = useState(false);
  const [mountPath, setMountPath] = useState('/workspace');
  const [ttl, setTtl] = useState('3600');
  const [nixPackageSearch, setNixPackageSearch] = useState('');
  const [nixPackages, setNixPackages] = useState<Array<{ name: string; version: string }>>([
    { name: 'nodejs', version: '20.10.0' },
    { name: 'python3', version: '3.11.6' },
  ]);
  const [envVars, setEnvVars] = useState<Array<{ name: string; value: string }>>([
    { name: 'NODE_ENV', value: '${{ secrets.NODE_ENV }}' },
  ]);

  // Collapsible state
  const [envVarsOpen, setEnvVarsOpen] = useState(true);
  const [nixPackagesOpen, setNixPackagesOpen] = useState(true);
  const [mcpLimitsOpen, setMcpLimitsOpen] = useState(false);
  const [mcpToolsOpen, setMcpToolsOpen] = useState(true);

  // Mock secret keys for demo
  const mockSecretKeys = [
    'SLACK_APP_TOKEN',
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'SLACK_WEBHOOK_URL',
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
  ];

  // Mock Nix packages for autocomplete
  const mockNixPackages = [
    'nodejs', 'python3', 'go', 'rust', 'gcc', 'git', 'vim', 'neovim', 
    'docker', 'kubectl', 'terraform', 'ansible', 'postgresql', 'redis'
  ];

  // Fetch Nix packages for autocomplete
  const fetchNixPackages = useCallback(async (query: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const mockPackages = [
      'nodejs', 'python3', 'go', 'rust', 'gcc', 'git', 'vim', 'neovim', 
      'docker', 'kubectl', 'terraform', 'ansible', 'postgresql', 'redis'
    ];
    const filtered = mockPackages
      .filter(pkg => pkg.toLowerCase().includes(query.toLowerCase()))
      .map(pkg => ({ value: pkg, label: pkg }));
    return filtered;
  }, []);

  // Add env var
  const addEnvVar = useCallback(() => {
    setEnvVars([...envVars, { name: '', value: '' }]);
  }, [envVars]);

  // Remove env var
  const removeEnvVar = useCallback((index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  }, [envVars]);

  // Update env var
  const updateEnvVar = useCallback((index: number, field: 'name' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index][field] = value;
    setEnvVars(newEnvVars);
  }, [envVars]);

  // Add MCP env var
  const addMcpEnvVar = useCallback(() => {
    setMcpEnvVars([...mcpEnvVars, { name: '', value: '' }]);
  }, [mcpEnvVars]);

  // Remove MCP env var
  const removeMcpEnvVar = useCallback((index: number) => {
    setMcpEnvVars(mcpEnvVars.filter((_, i) => i !== index));
  }, [mcpEnvVars]);

  // Update MCP env var
  const updateMcpEnvVar = useCallback((index: number, field: 'name' | 'value', value: string) => {
    const newEnvVars = [...mcpEnvVars];
    newEnvVars[index][field] = value;
    setMcpEnvVars(newEnvVars);
  }, [mcpEnvVars]);

  // Update Nix package version
  const updateNixPackageVersion = useCallback((index: number, version: string) => {
    const newPackages = [...nixPackages];
    newPackages[index].version = version;
    setNixPackages(newPackages);
  }, [nixPackages]);

  // Remove Nix package
  const removeNixPackage = useCallback((index: number) => {
    setNixPackages(nixPackages.filter((_, i) => i !== index));
  }, [nixPackages]);

  const statusInfo = statusConfig[status];
  const canProvision = status === 'not_ready' || status === 'deprovisioning_error';
  const canDeprovision = status === 'ready' || status === 'provisioning_error';

  return (
    <div className="w-[420px] bg-white border-l border-[var(--agyn-border-default)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
        <div>
          <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
          <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{nodeTitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge 
            color={statusInfo.color}
            bgColor={statusInfo.bgColor}
          >
            {statusInfo.label}
          </Badge>
          <IconButton
            icon={canProvision ? <Play className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            variant="ghost"
            size="md"
            disabled={!canProvision && !canDeprovision}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-8">
          {/* Title */}
          <section>
            <FieldLabel 
              label="Title" 
              hint="The display name for this node"
            />
            <Input defaultValue={nodeTitle} size="sm" />
          </section>

          {/* Agent-specific Configuration */}
          {nodeKind === 'Agent' && (
            <>
              {/* LLM Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">LLM</h3>
                
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="Model" 
                      hint="The LLM model identifier (e.g., gpt-4, claude-3-opus)"
                      required
                    />
                    <Input placeholder="gpt-4" defaultValue="gpt-4" size="sm" />
                  </div>

                  <div>
                    <FieldLabel 
                      label="System Prompt" 
                      hint="Initial instructions that define the agent's behavior and personality"
                    />
                    <MarkdownInput
                      rows={3}
                      placeholder="You are a helpful assistant..."
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      size="sm"
                    />
                  </div>
                </div>
              </section>

              {/* Finish Restriction Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[var(--agyn-dark)] font-semibold">Finish Restriction</h3>
                    <p className="text-xs text-[var(--agyn-gray)] mt-1">Do not allow to finish agent work without tool call</p>
                  </div>
                  <Toggle
                    label=""
                    description=""
                    checked={requireToolCallToFinish}
                    onCheckedChange={setRequireToolCallToFinish}
                  />
                </div>
                
                {requireToolCallToFinish && (
                  <div className="space-y-4 pl-4 border-l-2 border-[var(--agyn-border-default)]">
                    <div>
                      <FieldLabel 
                        label="Restriction Message" 
                        hint="Message shown when the agent tries to finish without calling required tools"
                      />
                      <Textarea
                        rows={2}
                        placeholder="You must use at least one tool before finishing."
                      />
                    </div>

                    <div>
                      <FieldLabel 
                        label="Max Injections" 
                        hint="Maximum number of times the restriction message can be injected"
                      />
                      <Input type="number" defaultValue="3" min="0" size="sm" />
                    </div>
                  </div>
                )}
              </section>

              {/* Messages Queue Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Messages Queue</h3>
                
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="Debounce (ms)" 
                      hint="Wait time in milliseconds before processing new messages"
                    />
                    <Input type="number" defaultValue="1000" min="0" step="100" size="sm" />
                  </div>

                  <div>
                    <FieldLabel 
                      label="When Busy" 
                      hint="Behavior when a new message arrives while agent is processing"
                    />
                    <Dropdown
                      options={[
                        { value: 'wait', label: 'Wait' },
                        { value: 'injectAfterTools', label: 'Inject After Tools' },
                      ]}
                      defaultValue="wait"
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Process Buffer" 
                      hint="How to process multiple queued messages"
                    />
                    <Dropdown
                      options={[
                        { value: 'allTogether', label: 'All Together' },
                        { value: 'oneByOne', label: 'One By One' },
                      ]}
                      defaultValue="oneByOne"
                      size="sm"
                    />
                  </div>
                </div>
              </section>

              {/* Summarization Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Summarization</h3>
                
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="Keep Tokens" 
                      hint="Number of tokens to preserve from the start of the conversation"
                    />
                    <Input type="number" defaultValue="1000" min="0" step="100" size="sm" />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Max Tokens" 
                      hint="Maximum tokens before triggering summarization"
                    />
                    <Input type="number" defaultValue="4000" min="0" step="100" size="sm" />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Prompt" 
                      hint="Instructions for how to summarize the conversation"
                    />
                    <Textarea
                      rows={2}
                      placeholder="Summarize the conversation above..."
                      defaultValue="Summarize the conversation above, preserving key details and context."
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Trigger-specific Configuration */}
          {nodeKind === 'Trigger' && (
            <>
              {/* Slack Configuration Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Slack Configuration</h3>
                
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="App Token" 
                      hint="Slack App-Level token for connecting to the Events API"
                      required
                    />
                    <ReferenceInput
                      value={appToken}
                      onChange={(e) => setAppToken(e.target.value)}
                      sourceType="secret"
                      secretKeys={mockSecretKeys}
                      placeholder="Select or enter app token..."
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Bot Token" 
                      hint="Slack Bot User OAuth token for authentication"
                      required
                    />
                    <ReferenceInput
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      sourceType="secret"
                      secretKeys={mockSecretKeys}
                      placeholder="Select or enter bot token..."
                      size="sm"
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* MCP-specific Configuration */}
          {nodeKind === 'MCP' && (
            <>
              {/* MCP Configuration Section */}
              <section>
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="Namespace" 
                      hint="Namespace for the MCP server"
                      required
                    />
                    <Input
                      placeholder="my-mcp-server"
                      value={mcpNamespace}
                      onChange={(e) => setMcpNamespace(e.target.value)}
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Command" 
                      hint="Command to start the MCP server"
                      required
                    />
                    <BashInput
                      rows={3}
                      placeholder="npx -y @modelcontextprotocol/server-everything"
                      value={mcpCommand}
                      onChange={(e) => setMcpCommand(e.target.value)}
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Working Directory" 
                      hint="Working directory for the MCP server"
                    />
                    <Input
                      placeholder="/path/to/workdir"
                      value={mcpWorkdir}
                      onChange={(e) => setMcpWorkdir(e.target.value)}
                      size="sm"
                    />
                  </div>
                </div>
              </section>

              {/* Environment Variables Section */}
              <section>
                <Collapsible open={envVarsOpen} onOpenChange={setEnvVarsOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Environment Variables</h3>
                      {envVarsOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="space-y-3">
                      {mcpEnvVars.map((envVar, index) => (
                        <div key={index} className="space-y-3">
                          <div className="flex-1">
                            <FieldLabel label="Name" />
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="VARIABLE_NAME"
                                value={envVar.name}
                                onChange={(e) => updateMcpEnvVar(index, 'name', e.target.value)}
                                size="sm"
                                className="flex-1"
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeMcpEnvVar(index)}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="pr-[48px]">
                            <FieldLabel label="Value" />
                            <ReferenceInput
                              value={envVar.value}
                              onChange={(e) => updateMcpEnvVar(index, 'value', e.target.value)}
                              sourceType="secret"
                              secretKeys={mockSecretKeys}
                              placeholder="Value or reference..."
                              size="sm"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addMcpEnvVar}
                      >
                        Add Variable
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Limits Section */}
              <section>
                <Collapsible open={mcpLimitsOpen} onOpenChange={setMcpLimitsOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Limits</h3>
                      {mcpLimitsOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="space-y-4">
                      <div>
                        <FieldLabel 
                          label="Request Timeout (ms)" 
                          hint="Timeout for MCP requests in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="60000"
                          value={mcpRequestTimeout}
                          onChange={(e) => setMcpRequestTimeout(e.target.value)}
                          size="sm"
                        />
                      </div>

                      <div>
                        <FieldLabel 
                          label="Startup Timeout (ms)" 
                          hint="Timeout for MCP server startup in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="30000"
                          value={mcpStartupTimeout}
                          onChange={(e) => setMcpStartupTimeout(e.target.value)}
                          size="sm"
                        />
                      </div>

                      <div>
                        <FieldLabel 
                          label="Heartbeat Interval (ms)" 
                          hint="Interval for MCP server heartbeats in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="10000"
                          value={mcpHeartbeatInterval}
                          onChange={(e) => setMcpHeartbeatInterval(e.target.value)}
                          size="sm"
                        />
                      </div>

                      <div>
                        <FieldLabel 
                          label="Stale Timeout (ms)" 
                          hint="Timeout for stale MCP server connections in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="30000"
                          value={mcpStaleTimeout}
                          onChange={(e) => setMcpStaleTimeout(e.target.value)}
                          size="sm"
                        />
                      </div>

                      <div>
                        <FieldLabel 
                          label="Restart Max Attempts" 
                          hint="Maximum number of restart attempts for MCP server"
                        />
                        <Input
                          type="number"
                          placeholder="3"
                          value={mcpRestartMaxAttempts}
                          onChange={(e) => setMcpRestartMaxAttempts(e.target.value)}
                          size="sm"
                        />
                      </div>

                      <div>
                        <FieldLabel 
                          label="Restart Backoff (ms)" 
                          hint="Backoff time between MCP server restart attempts in milliseconds"
                        />
                        <Input
                          type="number"
                          placeholder="5000"
                          value={mcpRestartBackoff}
                          onChange={(e) => setMcpRestartBackoff(e.target.value)}
                          size="sm"
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Tools Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Tools</h3>
                <div className="space-y-3">
                  {mcpTools.map((tool, index) => (
                    <ToolItem
                      key={index}
                      name={tool.name}
                      description={tool.description}
                      enabled={tool.enabled}
                      onToggle={(value) => {
                        const newTools = [...mcpTools];
                        newTools[index].enabled = value;
                        setMcpTools(newTools);
                      }}
                    />
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Workspace-specific Configuration */}
          {nodeKind === 'Workspace' && (
            <>
              {/* Container Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Container</h3>
                
                <div className="space-y-4">
                  <div>
                    <FieldLabel 
                      label="Image" 
                      hint="Docker image to use for the workspace"
                      required
                    />
                    <Input
                      placeholder="docker.io/library/ubuntu:latest"
                      value={workspaceImage}
                      onChange={(e) => setWorkspaceImage(e.target.value)}
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Platform" 
                      hint="Target platform for the workspace"
                    />
                    <Dropdown
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'linux/amd64', label: 'Linux AMD64' },
                        { value: 'linux/arm64', label: 'Linux ARM64' },
                      ]}
                      value={platform}
                      onValueChange={setPlatform}
                      size="sm"
                    />
                  </div>

                  <div>
                    <FieldLabel 
                      label="Initial Script" 
                      hint="Bash script to run when the workspace starts"
                    />
                    <BashInput
                      rows={3}
                      placeholder="echo 'Hello, World!'"
                      value={initialScript}
                      onChange={(e) => setInitialScript(e.target.value)}
                      size="sm"
                    />
                  </div>
                </div>
              </section>

              {/* Environment Variables Section */}
              <section>
                <Collapsible open={envVarsOpen} onOpenChange={setEnvVarsOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Environment Variables</h3>
                      {envVarsOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="space-y-3">
                      {envVars.map((envVar, index) => (
                        <div key={index} className="space-y-3">
                          <div className="flex-1">
                            <FieldLabel label="Name" />
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="VARIABLE_NAME"
                                value={envVar.name}
                                onChange={(e) => updateEnvVar(index, 'name', e.target.value)}
                                size="sm"
                                className="flex-1"
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeEnvVar(index)}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="pr-[48px]">
                            <FieldLabel label="Value" />
                            <ReferenceInput
                              value={envVar.value}
                              onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                              sourceType="secret"
                              secretKeys={mockSecretKeys}
                              placeholder="Value or reference..."
                              size="sm"
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addEnvVar}
                      >
                        Add Variable
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Enable Docker-in-Docker Section */}
              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Docker-in-Docker</h3>
                    <p className="text-xs text-[var(--agyn-gray)] mt-1">Allow the workspace to run Docker containers</p>
                  </div>
                  <Toggle
                    label=""
                    description=""
                    checked={enableDockerInDocker}
                    onCheckedChange={setEnableDockerInDocker}
                  />
                </div>
              </section>

              {/* Enable Persistent Volume Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Persistent Volume</h3>
                    <p className="text-xs text-[var(--agyn-gray)] mt-1">Persist data across workspace restarts</p>
                  </div>
                  <Toggle
                    label=""
                    description=""
                    checked={enablePersistentVolume}
                    onCheckedChange={setEnablePersistentVolume}
                  />
                </div>

                {enablePersistentVolume && (
                  <div className="pl-4 border-l-2 border-[var(--agyn-border-default)]">
                    <FieldLabel 
                      label="Mount Path" 
                      hint="Path in the workspace where the volume will be mounted"
                    />
                    <Input
                      placeholder="/workspace"
                      value={mountPath}
                      onChange={(e) => setMountPath(e.target.value)}
                      size="sm"
                    />
                  </div>
                )}
              </section>

              {/* Limits Section */}
              <section>
                <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Limits</h3>
                
                <div>
                  <FieldLabel 
                    label="TTL" 
                    hint="Time-to-live for the workspace in seconds"
                  />
                  <Input
                    type="number"
                    placeholder="3600"
                    value={ttl}
                    onChange={(e) => setTtl(e.target.value)}
                    size="sm"
                  />
                </div>
              </section>

              {/* Nix Packages Section */}
              <section>
                <Collapsible open={nixPackagesOpen} onOpenChange={setNixPackagesOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
                      <h3 className="text-[var(--agyn-dark)] font-semibold">Nix Packages</h3>
                      {nixPackagesOpen ? (
                        <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="space-y-4">
                      <AutocompleteInput
                        value={nixPackageSearch}
                        onChange={setNixPackageSearch}
                        fetchOptions={fetchNixPackages}
                        placeholder="Search packages..."
                        onSelect={(option) => {
                          // Add package to list if not already there
                          if (!nixPackages.some(pkg => pkg.name === option.value)) {
                            setNixPackages([...nixPackages, { name: option.value, version: 'latest' }]);
                          }
                          setNixPackageSearch('');
                        }}
                        clearable
                        size="sm"
                      />

                      {/* Package List */}
                      <div className="space-y-3">
                        {nixPackages.map((pkg, index) => (
                          <div key={index}>
                            <FieldLabel label={pkg.name} />
                            <div className="flex items-center gap-2">
                              <Dropdown
                                options={[
                                  { value: 'latest', label: 'Latest' },
                                  { value: '20.10.0', label: '20.10.0' },
                                  { value: '18.16.0', label: '18.16.0' },
                                  { value: '16.20.0', label: '16.20.0' },
                                ]}
                                value={pkg.version}
                                onValueChange={(value) => updateNixPackageVersion(index, value)}
                                size="sm"
                                className="flex-1"
                              />
                              <div className="w-[40px] flex items-center justify-center">
                                <IconButton
                                  icon={<Trash2 className="w-4 h-4" />}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeNixPackage(index)}
                                  className="hover:text-[var(--agyn-status-failed)]"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}