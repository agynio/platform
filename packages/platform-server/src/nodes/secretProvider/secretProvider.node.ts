import { Injectable } from '@nestjs/common';
import Node from '../base/Node';

export type SecretProviderType = 'vault' | 'aws_secrets_manager' | 'gcp_secret_manager' | 'azure_key_vault';

export interface SecretProviderNodeConfig {
  providerType?: SecretProviderType;
  endpoint?: string;
  authToken?: string;
}

@Injectable()
export class SecretProviderNode extends Node<SecretProviderNodeConfig> {
  getPortConfig() {
    return {
      sourcePorts: { $self: { kind: 'instance' } },
    } as const;
  }
}
