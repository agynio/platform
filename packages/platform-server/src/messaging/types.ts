export {
  SlackIdentifiersSchema,
  SlackChannelDescriptorSchema,
  ManageIdentifiersSchema,
  ManageChannelDescriptorSchema,
  ChannelDescriptorSchema,
  type ChannelDescriptor,
  type SlackChannelDescriptor,
  type ManageChannelDescriptor,
  type ThreadOutboxSource,
} from '../threads/thread-channel.schema';

export type ThreadOutboxSendRequest = {
  threadId: string;
  text: string;
  source: ThreadOutboxSource;
  prefix?: string;
  runId?: string | null;
};

export interface IChannelAdapter {
  sendText(payload: ThreadOutboxSendRequest): Promise<SendResult>;
}

export type SendResult = {
  ok: boolean;
  channelMessageId?: string | null;
  threadId?: string | null;
  error?: string | null;
};

// Adapters are provided via DI; no custom deps bags or adapter interfaces needed for v1.
