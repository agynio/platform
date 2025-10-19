import type { Node } from 'reactflow';

export type SlackTriggerData = { kind: 'slack-trigger'; name: string; channel: string };
export type AgentData = { kind: 'agent'; name: string; model: string; description: string };
export type SendSlackMessageData = { kind: 'send-slack-message'; name: string; channel: string; template: string };

export type BuilderNodeData = SlackTriggerData | AgentData | SendSlackMessageData;
export type BuilderNode = Node<BuilderNodeData>;

export type BuilderNodeKind = BuilderNodeData['kind'];

type KindToData = {
  'slack-trigger': Omit<SlackTriggerData, 'kind'>;
  'agent': Omit<AgentData, 'kind'>;
  'send-slack-message': Omit<SendSlackMessageData, 'kind'>;
};

export const DEFAULTS: KindToData = {
  'slack-trigger': { name: 'Slack Trigger', channel: '#general' },
  'agent': { name: 'Agent', model: 'gpt-4o-mini', description: '' },
  'send-slack-message': { name: 'Send Slack', channel: '#general', template: 'Deployment finished' }
};
