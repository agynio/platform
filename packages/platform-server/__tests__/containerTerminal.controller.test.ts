import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContainerTerminalController } from '../src/infra/container/containerTerminal.controller';
import type { TerminalSessionsService } from '../src/infra/container/terminal.sessions.service';

describe('ContainerTerminalController', () => {
  it('delegates to terminal sessions service', async () => {
    const response = {
      sessionId: 'sid',
      token: 'tok',
      wsUrl: '/api/containers/c/terminal/ws?sessionId=sid&token=tok',
      expiresAt: new Date().toISOString(),
      negotiated: { shell: '/bin/sh', cols: 120, rows: 32 },
    };
    const service = {
      createSession: vi.fn().mockResolvedValue(response),
    } as unknown as TerminalSessionsService;
    const controller = new ContainerTerminalController(service);

    const result = await controller.createSession('cid', { cols: 80, rows: 24 });

    expect(service.createSession).toHaveBeenCalledWith('cid', { cols: 80, rows: 24 });
    expect(result).toEqual(response);
  });

  it('throws BadRequest when container id missing', async () => {
    const service = {
      createSession: vi.fn(),
    } as unknown as TerminalSessionsService;
    const controller = new ContainerTerminalController(service);

    await expect(controller.createSession('', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('wraps service errors into BadRequestException', async () => {
    const service = {
      createSession: vi.fn().mockRejectedValue(new Error('bad')),
    } as unknown as TerminalSessionsService;
    const controller = new ContainerTerminalController(service);

    await expect(controller.createSession('cid', {})).rejects.toThrow('bad');
  });
});
