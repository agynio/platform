import http from 'node:http';
import expressModule from 'express';

export async function init() {
  return Promise.resolve();
}

export function express(factory) {
  if (typeof factory === 'function') {
    return factory();
  }
  return expressModule();
}

export function httpAgent() {
  return new http.Agent({ keepAlive: false });
}
