import { FactoryFn } from './types';
import { TemplatePortConfig, TemplatePortsRegistry } from './ports.types';

export class TemplateRegistry {
  private factories = new Map<string, FactoryFn>();
  private ports = new Map<string, TemplatePortConfig>();

  register(template: string, factory: FactoryFn, portConfig?: TemplatePortConfig): this {
    if (this.factories.has(template)) {
      // Allow override deliberately; could warn here if desired
    }
    this.factories.set(template, factory);
    if (portConfig) this.ports.set(template, portConfig);
    return this;
  }

  get(template: string): FactoryFn | undefined {
    return this.factories.get(template);
  }

  getPortsMap(): TemplatePortsRegistry {
    const out: TemplatePortsRegistry = {};
    for (const [k, v] of this.ports.entries()) out[k] = v;
    return out;
  }
}
