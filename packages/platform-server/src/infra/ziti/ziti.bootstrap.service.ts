import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { ZitiReconciler } from './ziti.reconciler';
import { ZitiRunnerProxyService } from './ziti.runnerProxy.service';

@Injectable()
export class ZitiBootstrapService implements OnModuleDestroy {
  private readonly logger = new Logger(ZitiBootstrapService.name);
  private initialization?: Promise<void>;

  constructor(
    @Inject(ZitiReconciler) private readonly reconciler: ZitiReconciler,
    @Inject(ZitiRunnerProxyService) private readonly proxy: ZitiRunnerProxyService,
  ) {}

  ensureReady(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initialize();
    }
    return this.initialization;
  }

  async onModuleDestroy(): Promise<void> {
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
