import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  info(message: string, ...optionalParams: unknown[]) {
    this.log('INFO', message, optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.log('DEBUG', message, optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.log('WARN', message, optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.log('ERROR', message, optionalParams);
  }

  private log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, optionalParams: unknown[]) {
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      message,
    };

    if (optionalParams.length > 0) {
      try {
        const context = this.sanitizeParams(optionalParams);
        if (context.length === 1 && this.isPlainRecord(context[0]) && !this.hasReservedKey(context[0])) {
          Object.assign(record, context[0] as Record<string, unknown>);
        } else if (context.length > 0) {
          record.context = context;
        }
      } catch (err) {
        record.context = [{ __serialization_error__: this.safeString(err) }];
      }
    }

    const payload = JSON.stringify(record);

    switch (level) {
      case 'DEBUG':
        console.debug(payload);
        break;
      case 'WARN':
        console.warn(payload);
        break;
      case 'ERROR':
        console.error(payload);
        break;
      default:
        console.info(payload);
    }
  }

  private serialize(params: unknown[]) {
    const redactKeyRe = /(authorization|token|accessToken|api[_-]?key|password|secret)/i;
    const redactValuePatterns: RegExp[] = [
      /(ghp_[A-Za-z0-9]{20,})/g,
      /(github_pat_[A-Za-z0-9_]{20,})/g,
      /(Bearer)\s+[-A-Za-z0-9._~+/]+=*/gi,
    ];
    const redactQueryParamRe = /([?&])(access_token|token|api[_-]?key|authorization|auth|password|secret)=([^&#]*)/gi;
    const MAX_STRING = 2000;
    const MAX_JSON = 20000;
    const MAX_DEPTH = 3;
    const MAX_KEYS = 100;

    try {
      const safeParams = this.sanitizeParamsInternal(params, {
        redactKeyRe,
        redactValuePatterns,
        redactQueryParamRe,
        MAX_STRING,
        MAX_JSON,
        MAX_DEPTH,
        MAX_KEYS,
      });
      const json = JSON.stringify(safeParams);
      return json.length > MAX_JSON ? json.slice(0, MAX_JSON) + `…(+${json.length - MAX_JSON} chars)` : json;
    } catch {
      try {
        const s = String(params);
        return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + '…' : s;
      } catch {
        return '[unserializable]';
      }
    }
  }

  private sanitizeParams(params: unknown[]): unknown[] {
    const defaults: SanitizationOptions = {
      redactKeyRe: /(authorization|token|accessToken|api[_-]?key|password|secret)/i,
      redactValuePatterns: [
        /(ghp_[A-Za-z0-9]{20,})/g,
        /(github_pat_[A-Za-z0-9_]{20,})/g,
        /(Bearer)\s+[-A-Za-z0-9._~+/]+=*/gi,
      ],
      redactQueryParamRe: /([?&])(access_token|token|api[_-]?key|authorization|auth|password|secret)=([^&#]*)/gi,
      MAX_STRING: 2000,
      MAX_JSON: 20000,
      MAX_DEPTH: 3,
      MAX_KEYS: 100,
    };

    return this.sanitizeParamsInternal(params, defaults);
  }

  private sanitizeParamsInternal(
    params: unknown[],
    options: SanitizationOptions,
  ): unknown[] {
    const seen = new WeakSet<object>();

    const redactString = (s: string): string => {
      let out = s;
      for (const re of options.redactValuePatterns) {
        out = out.replace(re, (_m: string, g1: string) => {
          if (typeof g1 === 'string' && /^Bearer$/i.test(g1)) return 'Bearer [REDACTED]';
          return '[REDACTED]';
        });
      }
      out = out.replace(options.redactQueryParamRe, (_m: string, pfx: string, key: string) => `${pfx}${key}=[REDACTED]`);
      if (out.length > options.MAX_STRING) {
        const extra = out.length - options.MAX_STRING;
        out = out.slice(0, options.MAX_STRING) + `…(+${extra} chars)`;
      }
      return out;
    };

    const toSafe = (v: unknown, depth = 0): unknown => {
      if (v instanceof Error) {
        const cause = 'cause' in v ? (v as { cause?: unknown }).cause : undefined;
        const safe: Record<string, unknown> = {
          name: v.name,
          message: redactString(String(v.message ?? '')),
          stack: v.stack ? redactString(String(v.stack)) : undefined,
          cause: undefined,
        };
        if (cause !== undefined) {
          if (depth + 1 >= options.MAX_DEPTH) safe.cause = '[Truncated]';
          else if (cause instanceof Error) safe.cause = toSafe(cause, depth + 1);
          else if (cause && typeof cause === 'object') safe.cause = toSafe(cause, depth + 1);
          else safe.cause = redactString(String(cause));
        }
        return safe;
      }
      if (v && typeof v === 'object') {
        const obj: Record<string, unknown> = v as Record<string, unknown>;
        if (seen.has(obj as object)) return '[Circular]';
        seen.add(obj as object);
        if (Array.isArray(v)) return (v as unknown[]).slice(0, options.MAX_KEYS).map((x) => toSafe(x, depth + 1));
        const out: Record<string, unknown> = {};
        let count = 0;
        for (const [k, val] of Object.entries(obj)) {
          if (count++ >= options.MAX_KEYS) {
            out['__truncated__'] = `[+${Object.keys(obj).length - options.MAX_KEYS} keys omitted]`;
            break;
          }
          out[k] = options.redactKeyRe.test(k) ? '[REDACTED]' : toSafe(val, depth + 1);
        }
        return out;
      }
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'string') return redactString(v);
      return v;
    };

    const safeParams = params.map((p) => toSafe(p, 0));

    try {
      const json = JSON.stringify(safeParams);
      if (json.length > options.MAX_JSON) {
        return [{ __truncated__: `context truncated after ${options.MAX_JSON} chars` }];
      }
    } catch {
      // Fall through: final serialization fallback occurs in serialize().
    }

    return safeParams;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private hasReservedKey(obj: Record<string, unknown>): boolean {
    const reserved = new Set(['ts', 'level', 'message']);
    for (const key of Object.keys(obj)) {
      if (reserved.has(key)) return true;
    }
    return false;
  }

  private safeString(input: unknown): string {
    try {
      return typeof input === 'string' ? input : JSON.stringify(input);
    } catch {
      return '[unserializable]';
    }
  }
}

type SanitizationOptions = {
  redactKeyRe: RegExp;
  redactValuePatterns: ReadonlyArray<RegExp>;
  redactQueryParamRe: RegExp;
  MAX_STRING: number;
  MAX_JSON: number;
  MAX_DEPTH: number;
  MAX_KEYS: number;
};
