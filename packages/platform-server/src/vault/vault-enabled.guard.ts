import { CanActivate, ExecutionContext, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { VaultService } from './vault.service';

@Injectable()
export class VaultEnabledGuard implements CanActivate {
  constructor(@Inject(VaultService) private vaultService: VaultService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.vaultService.isEnabled()) return true;
    throw new NotFoundException({ error: 'vault_disabled' });
  }
}
