export interface NixpkgsSelection {
  kind: 'nixpkgs';
  name: string;
  version: string;
  commitHash: string;
  attributePath: string;
}

export interface FlakeRepoSelection {
  kind: 'flakeRepo';
  repository: string;
  commitHash: string;
  attributePath: string;
  ref?: string;
}

export type NixPackageSelection = NixpkgsSelection | FlakeRepoSelection;

// Container (Workspace) Nix configuration shape stored under config.nix
export interface ContainerNixConfig {
  packages?: NixPackageSelection[];
}
