// Internal result types for potential future refinements of ShellCommandTool.
// Keep tool.execute returning string per FunctionTool interface for now.
export type ShellCommandSuccess = { ok: true; stdout: string; exitCode: number };
export type ShellCommandError = { ok: false; message: string; path?: string; exitCode?: number };
export type ShellCommandResult = ShellCommandSuccess | ShellCommandError;

