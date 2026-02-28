import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsGrpcPublisher } from '../src/notifications/notifications-grpc.publisher';

const { publishMock, createClientMock, createTransportMock } = vi.hoisted(() => ({
  publishMock: vi.fn(),
  createClientMock: vi.fn(),
  createTransportMock: vi.fn(),
}));

vi.mock('@connectrpc/connect', () => ({
  __esModule: true,
  createClient: createClientMock,
}));

vi.mock('@connectrpc/connect-node', () => ({
  __esModule: true,
  createConnectTransport: createTransportMock,
}));

const config = {
  baseUrl: 'http://notifications.local',
  deadlineMs: 1_000,
  source: 'platform-server',
};

describe('NotificationsGrpcPublisher', () => {
  beforeEach(() => {
    publishMock.mockReset();
    createClientMock.mockReset();
    createTransportMock.mockReset();
    createTransportMock.mockImplementation(() => ({}));
    createClientMock.mockImplementation(() => ({ publish: publishMock }));
  });

  it('throws when no rooms are provided', async () => {
    const publisher = new NotificationsGrpcPublisher(config);

    await expect(
      publisher.publishToRooms({ rooms: [], event: 'node_status', payload: {}, source: 'test-source' }),
    ).rejects.toThrowError('NotificationsGrpcPublisher requires at least one room');

    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes when rooms are provided', async () => {
    publishMock.mockResolvedValue(undefined);
    const publisher = new NotificationsGrpcPublisher(config);

    await publisher.publishToRooms({
      rooms: ['threads'],
      event: 'node_status',
      payload: { ok: true },
      source: 'test-source',
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [request, options] = publishMock.mock.calls[0] ?? [];
    expect(request).toEqual({
      event: 'node_status',
      rooms: ['threads'],
      payload: { ok: true },
      source: 'test-source',
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects payloads with non-JSON values', async () => {
    const publisher = new NotificationsGrpcPublisher(config);

    await expect(
      publisher.publishToRooms({
        rooms: ['threads'],
        event: 'node_status',
        payload: { invalid: () => undefined },
        source: 'test-source',
      }),
    ).rejects.toThrowError(
      'NotificationsGrpcPublisher payload values must be JSON-serializable; field "invalid" is function',
    );

    expect(publishMock).not.toHaveBeenCalled();
  });
});
