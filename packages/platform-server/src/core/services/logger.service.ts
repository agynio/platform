import { Injectable } from '@nestjs/common';
import { logger as tracingLogger } from '@agyn/tracing';

@Injectable()
export class LoggerService {
  info(message: string, ...optionalParams: unknown[]) {
    console.info(`[INFO] ${message}`, ...optionalParams);
    tracingLogger().info(`${message}\n${this.serialize(optionalParams)}`);
  }

  debug(message: string, ...optionalParams: unknown[]) {
    console.debug(`[DEBUG] ${message}`, ...optionalParams);
    tracingLogger().debug(`${message}\n${this.serialize(optionalParams)}`);
  }

  error(message: string, ...optionalParams: unknown[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
    tracingLogger().error(`${message}\n${this.serialize(optionalParams)}`);
  }

  private serialize(params: unknown[]) {
    const redactKeyRe = /(authorization|token|accessToken|api[_-]?key|password|secret)/i;
    // Value pattern redaction (ghp_, github_pat_, Bearer tokens)
    const redactValuePatterns: RegExp[] = [
      /(ghp_[A-Za-z0-9]{20,})/g,
      /(github_pat_[A-Za-z0-9_]{20,})/g,
      /(Bearer)\s+[A-Za-z0-9\-\._~\+\/]+=*/gi,
    ];
    // Query param redaction (e.g., ?token=..., &access_token=..., &api_key=...)
    const redactQueryParamRe = /([?&])(access_token|token|api[_-]?key|authorization|auth|password|secret)=([^&#]*)/gi;
    const MAX_STRING = 2000; // cap long strings
    const MAX_JSON = 20000; // cap overall payload
    const MAX_DEPTH = 3; // limit nested depth
    const MAX_KEYS = 100; // limit wide objects

    const seen = new WeakSet<object>();

    const redactString = (s: string): string => {
      let out = s;
      for (const re of redactValuePatterns) {
        out = out.replace(re, (_m: string, g1: string) => {
          // If first group is 'Bearer', preserve it; otherwise replace token match
          if (typeof g1 === 'string' && /^Bearer$/i.test(g1)) return 'Bearer [REDACTED]';
          return '[REDACTED]';
        });
      }
      // Scrub common sensitive query parameters
      out = out.replace(redactQueryParamRe, (_m: string, pfx: string, key: string) => `${pfx}${key}=[REDACTED]`);
      if (out.length > MAX_STRING) {
        const extra = out.length - MAX_STRING;
        out = out.slice(0, MAX_STRING) + `…(+${extra} chars)`;
      }
      return out;
    };

    const toSafe = (v: unknown, depth = 0): unknown => {
      if (v instanceof Error) {
        // Redact and truncate error fields, guard cause depth
        const cause = 'cause' in v ? (v as { cause?: unknown }).cause : undefined;
        const safe: Record<string, unknown> = {
          name: v.name,
          message: redactString(String(v.message ?? '')),
          stack: v.stack ? redactString(String(v.stack)) : undefined,
          cause: undefined,
        };
        if (cause !== undefined) {
          if (depth + 1 >= MAX_DEPTH) safe.cause = '[Truncated]';
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
        if (Array.isArray(v)) return (v as unknown[]).slice(0, MAX_KEYS).map((x) => toSafe(x, depth + 1));
        const out: Record<string, unknown> = {};
        let count = 0;
        for (const [k, val] of Object.entries(obj)) {
          if (count++ >= MAX_KEYS) {
            out['__truncated__'] = `[+${Object.keys(obj).length - MAX_KEYS} keys omitted]`;
            break;
          }
          out[k] = redactKeyRe.test(k) ? '[REDACTED]' : toSafe(val, depth + 1);
        }
        return out;
      }
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'string') return redactString(v);
      return v;
    };

    try {
      const json = JSON.stringify(params.map((p) => toSafe(p, 0)));
      if (json.length > MAX_JSON) return json.slice(0, MAX_JSON) + `…(+${json.length - MAX_JSON} chars)`;
      return json;
    } catch (_err) {
      try {
        const s = String(params);
        return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + '…' : s;
      } catch {
        return '[unserializable]';
      }
    }
  }
}
