export type UiNotificationPublishRequest = {
  rooms: string[];
  event: string;
  payload: unknown;
  source?: string;
};

export interface UiNotificationsPublisher {
  publishToRooms(request: UiNotificationPublishRequest): Promise<void>;
}

export const UI_NOTIFICATIONS_PUBLISHER = Symbol('UI_NOTIFICATIONS_PUBLISHER');
