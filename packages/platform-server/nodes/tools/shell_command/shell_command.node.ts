// Back-compat adapter exposing ShellTool symbol used by tests at old path
import { ShellCommandNode, ShellToolStaticConfigSchema } from '../../src/nodes/tools/shell_command/shell_command.node';
import { LoggerService } from '../../src/core/services/logger.service';

export { ShellToolStaticConfigSchema };

export class ShellTool {
  private node: ShellCommandNode;
  constructor(_vault: unknown, _logger: LoggerService) {
    this.node = new ShellCommandNode(new (require('../../src/core/env.resolver').EnvService)(undefined));
  }
  setContainerProvider(provider: any) { this.node.setContainerProvider(provider); }
  async setConfig(cfg: Record<string, unknown>) { await this.node.setConfig(cfg); }
  init() { return this.node.getTool(); }
}

