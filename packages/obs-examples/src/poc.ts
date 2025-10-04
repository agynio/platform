import { init, withSpan } from '@hautech/obs-sdk';

async function main() {
  const endpoint = process.env.OBS_EXTENDED_ENDPOINT || 'http://localhost:4319';
  init({
    mode: 'extended',
    endpoints: { extended: endpoint },
    defaultAttributes: { service: 'poc-app' }
  });
  await withSpan({ label: 'poc-root' }, async () => {
    await withSpan({ label: 'child-1' }, async () => {
      await new Promise(r => setTimeout(r, 300));
    });
  });
}

main().catch(console.error);
