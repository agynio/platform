import type { NixChannel } from '@/services/nix';

// Single selected Nix package (by attr), optionally tied to a channel.
export interface NixPackageSelection {
  attr: string;
  pname?: string;
  channel?: NixChannel | null;
}

// Container (Workspace) Nix configuration shape stored under config.nix
export interface ContainerNixConfig {
  packages?: NixPackageSelection[];
}

export type { NixChannel };

