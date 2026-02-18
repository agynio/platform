import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { ConfigService } from '../../core/services/config.service';
import { ZitiReconciler } from './ziti.reconciler';
import { ZitiRunnerProxyService } from './ziti.runnerProxy.service';

@Injectable()
export class ZitiBootstrapService implements OnModuleDestroy {
  private readonly logger = new Logger(ZitiBootstrapService.name);
  private initialization?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly reconciler: ZitiReconciler,
    private readonly proxy: ZitiRunnerProxyService,
  ) {}

  ensureReady(): Promise<void> {
    if (!this.config?.isZitiEnabled()) {
      return Promise.resolve();
    }
    if (!this.initialization) {
      this.initialization = this.initialize();
    }
    return this.initialization;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.config?.isZitiEnabled()) {
      return;
    }
    if (!this.proxy) {
      return;
    }
    await this.proxy.stop();
  }

  private async initialize(): Promise<void> {
    await this.reconciler.reconcile();
    await this.proxy.start();
    this.logger.log('Ziti control-plane reconciled');
  }
}
