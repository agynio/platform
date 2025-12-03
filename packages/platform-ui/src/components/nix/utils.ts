export function displayRepository(repository: string): string {
  return repository.replace(/^github:/i, '').replace(/\.git$/i, '');
}
