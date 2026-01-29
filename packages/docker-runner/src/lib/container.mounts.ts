import type { ContainerInspectInfo } from 'dockerode';

export interface ContainerMount {
  source: string;
  destination: string;
}

export function mapInspectMounts(mounts: ContainerInspectInfo['Mounts'] | undefined | null): ContainerMount[] {
  if (!Array.isArray(mounts)) return [];
  const result: ContainerMount[] = [];
  for (const mount of mounts) {
    if (!mount) continue;
    const name = typeof mount.Name === 'string' ? mount.Name.trim() : '';
    const sourceRaw = typeof mount.Source === 'string' ? mount.Source.trim() : '';
    const destination = typeof mount.Destination === 'string' ? mount.Destination.trim() : '';
    if (!destination) continue;
    const source = name || sourceRaw;
    if (!source) continue;
    result.push({ source, destination });
  }
  return result;
}

export function sanitizeContainerMounts(input: unknown): ContainerMount[] {
  if (!Array.isArray(input)) return [];
  const result: ContainerMount[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const source = typeof (entry as { source?: unknown }).source === 'string' ? (entry as { source: string }).source.trim() : '';
    const destination = typeof (entry as { destination?: unknown }).destination === 'string' ? (entry as { destination: string }).destination.trim() : '';
    if (!source || !destination) continue;
    result.push({ source, destination });
  }
  return result;
}
