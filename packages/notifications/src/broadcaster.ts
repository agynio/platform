import type { Logger } from 'pino';
import type { PublishedNotification } from './types';

type Listener = (notification: PublishedNotification) => void;

export class NotificationBroadcaster {
  private readonly listeners = new Set<Listener>();

  constructor(private readonly logger: Logger) {}

  publish(notification: PublishedNotification): void {
    for (const listener of this.listeners) {
      try {
        listener(notification);
      } catch (error) {
        this.logger.warn(
          {
            error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
          },
          'notifications: listener failure',
        );
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
