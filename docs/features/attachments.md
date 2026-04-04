# Attachments

Stave supports attaching files and images to chat messages through the prompt composer.

## File attachments

Users can attach project files to a message using the file picker button in the composer toolbar.

- The file picker opens the OS file dialog scoped to the current workspace.
- Selected files appear as removable chips above the toolbar.
- Clipboard file paste also works when the runtime exposes pasted files through `clipboardData.items` or `clipboardData.files`.
- On send, Stave opens each attached file through the editor tab system, reads its content and language, and forwards the result as `fileContexts` alongside the user message.

## Image attachments

Images can be attached in two ways:

1. **Clipboard paste** — paste images or copied workspace files from the system clipboard (`Cmd/Ctrl+V`) directly into the prompt textarea. The `onPaste` handler inspects both `clipboardData.items` and `clipboardData.files`, converts `image/*` files into image attachments, and routes non-image files to the workspace file attachment flow. Text-only pastes are unaffected.
2. **Multiple images** — clipboard paste can add multiple images. Each image receives a unique `crypto.randomUUID()` identifier.

Attached images appear as small thumbnails with a remove button. Clicking a thumbnail opens a full-screen preview overlay.

## Data model

```typescript
type Attachment =
  | { kind: "file"; filePath: string }
  | { kind: "image"; id: string; dataUrl: string; label: string };
```

- `kind: "file"` attachments carry a workspace-relative path and are resolved to file content at send time.
- `kind: "image"` attachments carry an inline data URL and a display label such as `"Pasted image"`.

Attachments are stored in the prompt draft state (`promptDraftByTask`) and cleared after a successful send.

## Send path

On send, Stave converts image attachments into `imageContexts`:

```typescript
{
  dataUrl: string;
  label: string;
  mimeType: "image/png";
}
```

These are passed to `sendUserMessage()` alongside `fileContexts` and the text content, where the active provider runtime includes them as image parts in the conversation turn.

## Component structure

- `PromptInput` — owns the paste handler, attachment display, and file picker trigger
- `ChatInput` — manages attachment state via `promptDraftByTask` and converts attachments to provider-facing contexts on send
- `MessageAttachment` / `MessageAttachments` — display components for rendering attachments in sent messages

## Verification

- File picking requires the Electron runtime (`window.api.fs.pickFiles`).
- Clipboard paste works in both Electron and browser runtimes since it uses standard `ClipboardEvent` and `FileReader` APIs.
- The `onAttachmentsChange` callback must be provided for image features to activate.
- Workspace file paste requires Electron to provide pasted files with a usable absolute path; otherwise users should use the file picker.
