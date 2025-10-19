#!/usr/bin/env node
// Simple mock MCP server writing newline-delimited JSON-RPC messages.
// Supports initialize, tools/list, tools/call (echo), ping.

import process from 'node:process';

type Json = any;

interface RpcReq {
  id?: number | string;
  method: string;
  params?: any;
}

let nextId = 1;

function send(obj: Json) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const tools = [
  {
    name: 'echo',
    description: 'Echo back provided text',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
];

process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (e) {
      /* ignore */
    }
  }
});

function handle(msg: RpcReq) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock', version: '0.0.1' },
      },
    });
    // no notifications/initialized for simplicity
    return;
  }
  if (msg.method === 'ping') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const args = msg.params || {}; // { name, arguments }
    if (args.name === 'echo') {
      const text = args.arguments?.text ?? '';
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [`echo:${text}`] } });
      return;
    }
    send({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [`unknown tool ${args.name}`] } });
    return;
  }
  // default
  send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
}

process.on('SIGTERM', () => process.exit(0));
