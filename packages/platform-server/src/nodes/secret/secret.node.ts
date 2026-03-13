import { Injectable } from '@nestjs/common';
import Node from '../base/Node';

export interface SecretNodeConfig {
  secretPath?: string;
  secretKey?: string;
  version?: string;
}

@Injectable()
export class SecretNode extends Node<SecretNodeConfig> {
  getPortConfig() {
    return {
      sourcePorts: { $self: { kind: 'instance' } },
      targetPorts: { provider: { kind: 'instance' } },
    } as const;
  }
}
