import { EventEmitter } from 'node:events';

const channels: Map<string, Set<InMemoryRedis>> = new Map();

class InMemoryRedis extends EventEmitter {
  constructor(_url: string, _options?: unknown) {
    super();
  }

  async connect(): Promise<this> {
    queueMicrotask(() => this.emit('ready'));
    return this;
  }

  async subscribe(channel: string): Promise<number> {
    const subscribers = channels.get(channel) ?? new Set<InMemoryRedis>();
    subscribers.add(this);
    channels.set(channel, subscribers);
    return subscribers.size;
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscribers = channels.get(channel);
    if (!subscribers || subscribers.size === 0) return 0;
    for (const subscriber of subscribers) {
      queueMicrotask(() => subscriber.emit('message', channel, message));
    }
    return subscribers.size;
  }

  async quit(): Promise<void> {
    for (const [channel, subscribers] of channels.entries()) {
      subscribers.delete(this);
      if (subscribers.size === 0) {
        channels.delete(channel);
      }
    }
    this.removeAllListeners();
  }
}

export default InMemoryRedis;
