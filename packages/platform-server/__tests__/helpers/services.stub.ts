import { EnvService } from '../../src/env/env.service';
import { NcpsKeyService } from '../../src/infra/ncps/ncpsKey.service';
import type { ConfigService } from '../../src/core/services/config.service';
import { registerTestConfig } from './config';

export function createEnvServiceStub(): EnvService {
  return new EnvService();
}

export function createConfigServiceStub(): ConfigService {
  return registerTestConfig();
}

export function createNcpsKeyServiceStub(configService: ConfigService): NcpsKeyService {
  return new NcpsKeyService(configService);
}
