// Runtime configuration for the obs-ui library.
// Provider sets the serverUrl at runtime; services read it via getters.

let _serverUrl: string | null = null;

export function setServerUrl(url: string) {
  if (!url || typeof url !== 'string') throw new Error('ObsUi: serverUrl must be a non-empty string');
  _serverUrl = url.replace(/\/$/, ''); // trim trailing slash
}

export function getServerUrl(): string {
  if (_serverUrl) return _serverUrl;
  throw new Error('ObsUi: serverUrl not configured. Wrap your app in <ObsUiProvider serverUrl={...} />');
}
