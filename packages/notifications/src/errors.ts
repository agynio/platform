export type SerializedError = { name?: string; message: string };

export const serializeError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  if (error && typeof error === 'object') {
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: '[object]' };
    }
  }

  return { message: String(error) };
};
