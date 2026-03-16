declare module 'picomatch' {
  export type PicomatchOptions = Record<string, unknown>;
  export type Matcher = (input: string) => boolean;

  export default function picomatch(
    pattern: string | readonly string[],
    options?: PicomatchOptions,
  ): Matcher;
}
