import { EdgeDef } from './types';
import { TemplatePortsRegistry, ResolvedEdgePorts, PortResolutionError, PortConfig, MethodPortConfig } from './ports.types';

@Injectable()
export class PortsRegistry {
  constructor(private readonly templates: TemplatePortsRegistry) {}

  getTemplateConfig(template: string) {
    return this.templates[template];
  }

  validateTemplateInstance(template: string, instance: any) {  
    const cfg = this.templates[template];
    if (!cfg) return; // no ports defined; legacy fallback elsewhere
    const checkPorts = (ports?: Record<string, PortConfig>) => {
      if (!ports) return;
      for (const [handle, port] of Object.entries(ports)) {
        if (port.kind === 'method') {
          const m = port as MethodPortConfig;
            if (typeof instance[m.create] !== 'function') {
              throw new Error(`Template ${template} port ${handle} expected method '${m.create}' on instance`);
            }
            if (m.destroy && typeof instance[m.destroy] !== 'function') {
              throw new Error(`Template ${template} port ${handle} expected destroy method '${m.destroy}' on instance`);
            }
          }
      }
    };
    checkPorts(cfg.sourcePorts);
    checkPorts(cfg.targetPorts);
  }

  resolveEdge(edge: EdgeDef, sourceTemplate: string, targetTemplate: string): ResolvedEdgePorts {
    const sourceCfg = this.templates[sourceTemplate];
    const targetCfg = this.templates[targetTemplate];
    if (!sourceCfg) throw new PortResolutionError(`No ports registered for source template '${sourceTemplate}'`, edge);
    if (!targetCfg) throw new PortResolutionError(`No ports registered for target template '${targetTemplate}'`, edge);
    const sourcePort = sourceCfg.sourcePorts?.[edge.sourceHandle];
    const targetPort = targetCfg.targetPorts?.[edge.targetHandle];
    if (!sourcePort) throw new PortResolutionError(`Unknown source handle '${edge.sourceHandle}' for template '${sourceTemplate}'`, edge);
    if (!targetPort) throw new PortResolutionError(`Unknown target handle '${edge.targetHandle}' for template '${targetTemplate}'`, edge);

    const bothMethod = sourcePort.kind === 'method' && targetPort.kind === 'method';
    const neitherMethod = sourcePort.kind !== 'method' && targetPort.kind !== 'method';
    if (bothMethod) throw new PortResolutionError('Both ports are method kind; exactly one must be method', edge);
    if (neitherMethod) throw new PortResolutionError('Neither port is method kind; exactly one must be method', edge);

    const callableSide = sourcePort.kind === 'method' ? 'source' : 'target';
    const methodPort = (callableSide === 'source'
      ? { role: 'source' as const, handle: edge.sourceHandle, config: sourcePort }
      : { role: 'target' as const, handle: edge.targetHandle, config: targetPort });
    const instancePort = (callableSide === 'source'
      ? { role: 'target' as const, handle: edge.targetHandle, config: targetPort }
      : { role: 'source' as const, handle: edge.sourceHandle, config: sourcePort });

    return {
  source: { role: 'source' as const, handle: edge.sourceHandle, config: sourcePort },
  target: { role: 'target' as const, handle: edge.targetHandle, config: targetPort },
      callableSide,
      methodPort,
      instancePort,
    };
  }
}
import { Injectable } from '@nestjs/common';
