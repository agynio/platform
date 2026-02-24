import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mockModuleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '@openziti',
  'ziti-sdk-nodejs',
);

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === '@openziti/ziti-sdk-nodejs') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(mockModuleRoot, 'index.js')).href,
    };
  }
  if (specifier === '@openziti/ziti-sdk-nodejs/lib/express-listener.js') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(mockModuleRoot, 'lib', 'express-listener.js')).href,
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
