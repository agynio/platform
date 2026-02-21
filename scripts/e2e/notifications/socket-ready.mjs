#!/usr/bin/env node
import process from 'node:process';
import { io as createSocketClient } from 'socket.io-client';

const DEFAULTS = {
  envoyBaseUrl: 'http://localhost:8080',
  socketPath: '/socket.io',
  timeoutMs: 5000,
};

const toPositiveInt = (value) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const main = async () => {
  const envoyBaseUrl = (process.env.ENVOY_BASE_URL ?? DEFAULTS.envoyBaseUrl).trim();
  const socketPath = (process.env.SOCKET_IO_PATH ?? DEFAULTS.socketPath).trim();
  const timeoutMs = toPositiveInt(process.env.CONNECT_TIMEOUT_MS) ?? DEFAULTS.timeoutMs;

  if (!envoyBaseUrl) throw new Error('ENVOY_BASE_URL is required');
  if (!socketPath) throw new Error('SOCKET_IO_PATH is required');

  const socket = createSocketClient(envoyBaseUrl, {
    path: socketPath,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: timeoutMs,
  });

  try {
    await new Promise((resolve, reject) => {
      const handleError = (error) => {
        socket.off('connect', handleConnect);
        reject(error);
      };

      const handleConnect = () => {
        socket.off('connect_error', handleError);
        socket.off('error', handleError);
        resolve();
      };

      socket.once('connect', handleConnect);
      socket.once('connect_error', handleError);
      socket.once('error', handleError);
    });
  } finally {
    socket.disconnect();
  }
};

main().catch((error) => {
  console.error('socket readiness check failed', error);
  process.exit(1);
});
