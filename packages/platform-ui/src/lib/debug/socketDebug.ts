type PayloadFactory = () => unknown;

export function createSocketLogger(namespace: string) {
  return (message: string, payload?: unknown | PayloadFactory) => {
    let value: unknown = undefined;
    if (typeof payload === 'function') {
      try {
        value = (payload as PayloadFactory)();
      } catch (error) {
        value = error instanceof Error ? { logError: { name: error.name, message: error.message } } : { logError: error };
      }
    } else {
      value = payload;
    }

    if (value === undefined) console.debug(`[${namespace}] ${message}`);
    else console.debug(`[${namespace}] ${message}`, value);
  };
}
