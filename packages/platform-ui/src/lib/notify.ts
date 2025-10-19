export function notifySuccess(msg: string) {
  // TODO: replace with app toast/notification system
  console.info('[SUCCESS]', msg);
}
export function notifyError(msg: string) {
  // TODO: replace with app toast/notification system
  console.error('[ERROR]', msg);
  try {
    alert(msg);
  } catch {
    /* no-op */
  }
}
