export const NOTIFICATIONS_CHANNEL = 'notifications.v1' as const;

export type NotificationSource = 'platform-server';

export type StaticNotificationRoom = 'graph' | 'threads';
export type ThreadNotificationRoom = `thread:${string}`;
export type RunNotificationRoom = `run:${string}`;
export type NodeNotificationRoom = `node:${string}`;
export type NotificationRoom =
  | StaticNotificationRoom
  | ThreadNotificationRoom
  | RunNotificationRoom
  | NodeNotificationRoom;

export type NotificationEnvelope<EventName extends string = string, Payload = unknown> = {
  id: string;
  ts: string;
  source: NotificationSource;
  rooms: NotificationRoom[];
  event: EventName;
  payload: Payload;
};

export type NotificationPublishRequest<EventName extends string = string, Payload = unknown> = {
  rooms: NotificationRoom[];
  event: EventName;
  payload: Payload;
};
