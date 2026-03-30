# VS Code Inline Completion Analysis

## Purpose

This note summarizes why VS Code inline completions often feel much faster than a naive Monaco + backend request loop, and which editor-side ideas are worth porting into Stave.

Date: 2026-03-27

## Bottom line

VS Code does not feel fast only because the model is fast. It layers several editor-side optimizations so the UI can often reuse, reshape, or short-circuit work before another expensive backend round trip is required.

The biggest difference from Stave's current approach is that VS Code treats inline completion as editor state first, backend response second.

## What VS Code does

### 1. Reuses equivalent in-flight and completed requests

VS Code builds an `UpdateRequest` and checks whether the current request is already satisfied by:

- the active in-flight operation
- the currently stored inline completion state

This avoids refetching when the cursor position, trigger context, document version, and provider set still satisfy the request.

Source:

- `src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.ts`

### 2. Uses adaptive debounce instead of a fixed delay

VS Code tracks recent provider latencies with a sliding window and computes debounce per model/provider combination. The delay is clamped between configured min/max bounds.

That means fast providers stay snappy, while slower providers naturally back off to reduce churn.

Source:

- `src/vs/editor/common/services/languageFeatureDebounce.ts`

### 3. Keeps and transforms inline completion state across edits

When the document changes, VS Code does not immediately throw away the old inline completion state. It applies text edits to the existing state and tries to preserve suggestions and identity where possible.

This is one of the main reasons ghost text can feel continuous while typing.

Source:

- `src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.ts`

### 4. Stops early once an automatic suggestion is already good enough

For automatic triggering, VS Code does not always wait for every provider. If it finds the first visible inline completion, it can stop early.

That reduces tail latency and makes the first useful ghost text appear sooner.

Source:

- `src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.ts`

### 5. Aggressively cancels stale work

VS Code wires cancellation through `CancellationTokenSource` and disposes stale provider work as soon as the request loses relevance.

The important detail is that this cancellation is coordinated with editor request/state ownership, not just bolted onto backend process management.

Source:

- `src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.ts`
- VS Code API `InlineCompletionItemProvider`

### 6. Relies on visibility rules, not just "I have text"

Ghost text is shown only when Monaco/VS Code determines the inline edit is actually visible for the current cursor position and replacement range.

Important factors include:

- replacement range
- filter text
- whether the suggestion survives common-prefix minimization
- whether the suggested edit inserts visible text at or after the cursor

This is why "backend returned text" and "ghost text is visible" are not the same condition.

Sources:

- `src/vs/editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js`
- `src/vs/editor/contrib/inlineCompletions/browser/model/computeGhostText.js`
- VS Code API `InlineCompletionItem`

### 7. The API shape is intentionally minimal for automatic completions

The provider API is designed so automatic triggering often needs only one useful inline item. The extension sample is simple on purpose: return an inline item with the right range and let the editor machinery do the rest.

Sources:

- VS Code API `InlineCompletionItemProvider`
- `microsoft/vscode-extension-samples` inline completions sample

## Why Stave currently feels slower

Stave currently spends more of the latency budget on backend request management than on editor-state reuse.

The current pain points are:

- ghost text can disappear even after `result: true` if the editor-side state for refresh/reuse is not preserved correctly
- fixed debounce is simpler, but it does not adapt to observed provider latency
- completion reuse is narrower than VS Code's `request satisfies` model
- old suggestion state is not yet transformed as deeply across edits as VS Code does
- backend request cost is still a larger part of the loop than in VS Code's optimized editor pipeline

## Practical takeaways for Stave

### High-value changes

1. Broaden reuse from exact-key matches to a true "request satisfies request" model.
2. Add adaptive debounce based on recent observed inline completion latency.
3. Keep editor-local completion state and transform it through small edits instead of invalidating aggressively.
4. Prefer the first visible useful completion over waiting for a fuller backend answer.
5. Treat visibility correctness as a first-class concern:
   range, filter text, prefix trimming, and refresh semantics all matter.

### Ghost text caveat

One concrete lesson from the VS Code sources:

Successful provider output is not sufficient by itself. The editor must still consider the inline edit visible after range normalization and common-prefix removal. Any Stave optimization that improves reuse but weakens that visibility contract can make `result: true` logs coexist with no ghost text on screen.

## Recommended implementation order for Stave

1. Stabilize ghost text visibility for successful results.
2. Add editor-local reuse for same-snapshot and prefix-extension requests.
3. Introduce adaptive debounce with a small rolling window.
4. Reduce backend work only after editor reuse is working reliably.
5. Add richer state transformation across edits if latency is still not acceptable.

## References

- VS Code API: `InlineCompletionItemProvider` and `InlineCompletionItem`
  https://code.visualstudio.com/api/references/vscode-api
- VS Code source: `inlineCompletionsSource.ts`
  https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.ts
- VS Code source: `languageFeatureDebounce.ts`
  https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/services/languageFeatureDebounce.ts
- VS Code sample: inline completions extension
  https://github.com/microsoft/vscode-extension-samples/blob/main/inline-completions/src/extension.ts
