/**
 * Shared quit-confirmation state for the main process.
 *
 * Use `bypassQuitConfirmation()` before calling `app.quit()` in programmatic
 * quit paths (e.g. update-restart) that must not show the user-facing dialog.
 */

let _skipConfirmation = false;

export function bypassQuitConfirmation(): void {
  _skipConfirmation = true;
}

export function shouldSkipQuitConfirmation(): boolean {
  return _skipConfirmation;
}
