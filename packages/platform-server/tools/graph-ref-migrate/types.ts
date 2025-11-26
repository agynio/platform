export type MigrationMode = 'dry-run' | 'write';

export type MigrationOptions = {
  input: string;
  includes: string[];
  excludes: string[];
  mode: MigrationMode;
  backup: boolean;
  defaultMount: string;
  knownMounts: string[];
  validateSchema: boolean;
  verbose: boolean;
  cwd: string;
};

export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  verbose(message: string): void;
};

export type ConversionKind = 'vault' | 'var' | 'static';

export type LegacyKind = 'vault' | 'env' | 'static';

export type ConversionRecord = {
  pointer: string;
  kind: ConversionKind;
  legacy: LegacyKind;
  usedDefaultMount?: boolean;
};

export type MigrationError = {
  pointer: string;
  message: string;
};

export type TransformOutcome = {
  value: unknown;
  changed: boolean;
  conversions: ConversionRecord[];
  errors: MigrationError[];
};

export type FileOutcome = {
  path: string;
  changed: boolean;
  conversions: ConversionRecord[];
  errors: MigrationError[];
  skipped?: boolean;
};

export type MigrationSummary = {
  files: FileOutcome[];
  mode: MigrationMode;
};
