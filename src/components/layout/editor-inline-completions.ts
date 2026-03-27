import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorApi, IDisposable, IPosition } from "monaco-editor";

export interface InlineCompletionSettings {
  enabled: boolean;
}

interface InlineCompletionResponse {
  ok: boolean;
  text: string;
  error?: string;
}

interface ResolvedInlineCompletionSnapshot {
  filePath: string;
  language: string;
  prefix: string;
  suffix: string;
  text: string;
}

interface PendingInlineCompletionRequest {
  key: string;
  filePath: string;
  language: string;
  prefix: string;
  suffix: string;
  startedAt: number;
  promise: Promise<InlineCompletionResponse>;
}

interface InlineCompletionRequestSnapshot {
  key: string;
  filePath: string;
  language: string;
  prefix: string;
  suffix: string;
}

interface ReusedInlineCompletion {
  text: string;
  kind: "exact" | "tail" | "transformed";
}

type InFlightLogKind = "exact" | "compatible";

const MONACO_DEBOUNCE_MS = 10;
const ADAPTIVE_DEBOUNCE_DEFAULT_MS = 24;
const ADAPTIVE_DEBOUNCE_MIN_MS = 12;
const ADAPTIVE_DEBOUNCE_MAX_MS = 90;
const ADAPTIVE_DEBOUNCE_SAMPLE_SIZE = 6;
const ADAPTIVE_DEBOUNCE_BUCKET_LIMIT = 50;
const MIN_PREFIX_LENGTH = 10;

let registeredDisposable: IDisposable | null = null;
let inFlightRequest: PendingInlineCompletionRequest | null = null;
let cachedResolvedRequest:
  | {
      key: string;
      result: InlineCompletionResponse;
    }
  | null = null;
let lastResolvedCompletion: ResolvedInlineCompletionSnapshot | null = null;
let debounceSamplesByBucket = new Map<string, number[]>();
let inlineCompletionChangeEmitter:
  | {
      event: (listener: () => void, thisArg?: unknown) => IDisposable;
      fire: () => void;
      dispose: () => void;
    }
  | null = null;
let lastLoggedInFlightRequest:
  | {
      promise: Promise<InlineCompletionResponse>;
      kind: InFlightLogKind;
    }
  | null = null;
let latestObservedRequest: InlineCompletionRequestSnapshot | null = null;

function getWorkspaceFilePath(uri: { scheme: string; path: string; query?: string }): string | null {
  if (uri.scheme !== "file" || uri.query) {
    return null;
  }
  const normalized = uri.path.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized || null;
}

function buildInlineCompletionRequestKey(args: {
  filePath: string;
  language: string;
  versionId: number;
  offset: number;
}) {
  return `${args.filePath}::${args.language}::${args.versionId}::${args.offset}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildDebounceBucketKey(args: { filePath: string; language: string }) {
  return `${args.filePath}::${args.language}`;
}

function getAdaptiveDebounceMs(args: { filePath: string; language: string }) {
  const bucketKey = buildDebounceBucketKey(args);
  const samples = debounceSamplesByBucket.get(bucketKey);
  if (!samples || samples.length === 0) {
    return ADAPTIVE_DEBOUNCE_DEFAULT_MS;
  }

  const averageLatencyMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return clamp(
    Math.round(averageLatencyMs * 0.15),
    ADAPTIVE_DEBOUNCE_MIN_MS,
    ADAPTIVE_DEBOUNCE_MAX_MS,
  );
}

function recordAdaptiveDebounceSample(args: { filePath: string; language: string }, latencyMs: number) {
  const bucketKey = buildDebounceBucketKey(args);
  const existingSamples = debounceSamplesByBucket.get(bucketKey) ?? [];
  const nextSamples = [...existingSamples, latencyMs].slice(-ADAPTIVE_DEBOUNCE_SAMPLE_SIZE);
  debounceSamplesByBucket.delete(bucketKey);
  debounceSamplesByBucket.set(bucketKey, nextSamples);

  if (debounceSamplesByBucket.size > ADAPTIVE_DEBOUNCE_BUCKET_LIMIT) {
    const oldestKey = debounceSamplesByBucket.keys().next().value;
    if (oldestKey) {
      debounceSamplesByBucket.delete(oldestKey);
    }
  }
}

function waitForAdaptiveDebounce(
  delayMs: number,
  token: { isCancellationRequested: boolean; onCancellationRequested: (listener: () => void) => IDisposable },
) {
  if (delayMs <= 0 || token.isCancellationRequested) {
    return Promise.resolve(!token.isCancellationRequested);
  }

  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      cancellationDisposable.dispose();
      resolve(true);
    }, delayMs);

    const cancellationDisposable = token.onCancellationRequested(() => {
      clearTimeout(timeoutId);
      cancellationDisposable.dispose();
      resolve(false);
    });
  });
}

function buildInlineCompletionItems(position: IPosition, text: string) {
  return {
    items: [
      {
        insertText: text,
        filterText: text,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
      },
    ],
  };
}

function canReuseInlineCompletionSnapshot(
  snapshot:
    | {
        filePath: string;
        language: string;
        prefix: string;
        suffix: string;
      }
    | null,
  args: {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
  },
) {
  if (!snapshot) {
    return false;
  }
  if (snapshot.filePath !== args.filePath || snapshot.language !== args.language) {
    return false;
  }
  if (snapshot.suffix !== args.suffix) {
    return false;
  }
  return args.prefix.startsWith(snapshot.prefix);
}

function sliceRemainingCompletionText(suggestedText: string, typedText: string) {
  if (!typedText || !suggestedText.startsWith(typedText)) {
    return null;
  }
  const remainingText = suggestedText.slice(typedText.length);
  return remainingText.trim() ? remainingText : null;
}

function deriveInlineCompletionFromCompletedState(
  snapshot: ResolvedInlineCompletionSnapshot,
  args: {
    prefix: string;
    suffix: string;
  },
) {
  const completedText = `${snapshot.prefix}${snapshot.text}${snapshot.suffix}`;
  if (!completedText.startsWith(args.prefix) || !completedText.endsWith(args.suffix)) {
    return null;
  }

  const suggestionStart = args.prefix.length;
  const suggestionEnd = completedText.length - args.suffix.length;
  if (suggestionEnd <= suggestionStart) {
    return null;
  }

  const remainingText = completedText.slice(suggestionStart, suggestionEnd);
  return remainingText.trim() ? remainingText : null;
}

function deriveInlineCompletionFromSnapshot(
  snapshot: ResolvedInlineCompletionSnapshot | null,
  args: {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
  },
) {
  if (!canReuseInlineCompletionSnapshot(snapshot, args) || !snapshot) {
    if (!snapshot || snapshot.filePath !== args.filePath || snapshot.language !== args.language) {
      return null;
    }

    const transformedText = deriveInlineCompletionFromCompletedState(snapshot, args);
    return transformedText
      ? {
          text: transformedText,
          kind: "transformed" as const,
        }
      : null;
  }

  const typedSincePrevious = args.prefix.slice(snapshot.prefix.length);
  if (typedSincePrevious.length === 0) {
    return snapshot.text.trim()
      ? {
          text: snapshot.text,
          kind: "exact" as const,
        }
      : null;
  }

  const exactRemainingText = sliceRemainingCompletionText(snapshot.text, typedSincePrevious);
  if (exactRemainingText) {
    return {
      text: exactRemainingText,
      kind: "tail" as const,
    };
  }

  const trimmedLeadingText = snapshot.text.trimStart();
  if (trimmedLeadingText !== snapshot.text) {
    const trimmedRemainingText = sliceRemainingCompletionText(trimmedLeadingText, typedSincePrevious);
    if (trimmedRemainingText) {
      return {
        text: trimmedRemainingText,
        kind: "tail" as const,
      };
    }
  }

  const transformedText = deriveInlineCompletionFromCompletedState(snapshot, args);
  return transformedText
    ? {
        text: transformedText,
        kind: "transformed" as const,
      }
    : null;
}

function deriveInlineCompletionFromPrevious(args: {
  filePath: string;
  language: string;
  prefix: string;
  suffix: string;
}) {
  return deriveInlineCompletionFromSnapshot(lastResolvedCompletion, args);
}

function scheduleInlineCompletionRefresh(args: {
  changeEmitter: { fire: () => void };
  triggerInlineSuggestRefresh?: () => void;
}) {
  setTimeout(() => {
    args.changeEmitter.fire();
    args.triggerInlineSuggestRefresh?.();
  }, 0);
}

function logInFlightReuse(request: PendingInlineCompletionRequest, kind: InFlightLogKind) {
  if (
    lastLoggedInFlightRequest?.promise === request.promise
    && lastLoggedInFlightRequest.kind === kind
  ) {
    return;
  }

  lastLoggedInFlightRequest = {
    promise: request.promise,
    kind,
  };
  console.debug(
    kind === "exact"
      ? "[inline-comp] reusing in-flight request"
      : "[inline-comp] waiting for compatible in-flight request",
  );
}

function projectResolvedSnapshotToLatestRequest(
  snapshot: ResolvedInlineCompletionSnapshot | null,
  settledRequestKey: string,
) {
  if (!snapshot || !latestObservedRequest || latestObservedRequest.key === settledRequestKey) {
    return null;
  }

  const reusedCompletion = deriveInlineCompletionFromSnapshot(snapshot, latestObservedRequest);
  if (!reusedCompletion?.text.trim()) {
    return null;
  }

  return {
    key: latestObservedRequest.key,
    result: {
      ok: true,
      text: reusedCompletion.text,
    } satisfies InlineCompletionResponse,
  };
}

export function configureInlineCompletions(args: {
  monaco: Monaco;
  getSettings: () => InlineCompletionSettings;
  triggerInlineSuggestRefresh?: () => void;
}) {
  if (registeredDisposable) {
    return;
  }

  if (!inlineCompletionChangeEmitter) {
    const EmitterCtor = (args.monaco as Monaco & {
      Emitter: new () => {
        event: (listener: () => void, thisArg?: unknown) => IDisposable;
        fire: (event: void) => void;
        dispose: () => void;
      };
    }).Emitter;
    inlineCompletionChangeEmitter = new EmitterCtor();
  }
  const changeEmitter = inlineCompletionChangeEmitter!;

  registeredDisposable = args.monaco.languages.registerInlineCompletionsProvider(
    { pattern: "**" },
    {
      onDidChangeInlineCompletions: changeEmitter.event,
      provideInlineCompletions: async (
        model: MonacoEditorApi.ITextModel,
        position: IPosition,
        _context: unknown,
        token: { isCancellationRequested: boolean; onCancellationRequested: (listener: () => void) => IDisposable },
      ) => {
        const currentSettings = args.getSettings();
        if (!currentSettings.enabled) {
          return { items: [] };
        }

        const requestFn = window.api?.inlineCompletion?.request;
        if (!requestFn) {
          return { items: [] };
        }

        const filePath = getWorkspaceFilePath(model.uri);
        if (!filePath) {
          console.debug("[inline-comp] bail: uri scheme =", model.uri.scheme);
          return { items: [] };
        }

        const fullText = model.getValue();
        const offset = model.getOffsetAt(position);
        const prefix = fullText.slice(0, offset);
        const suffix = fullText.slice(offset);
        const language = model.getLanguageId();
        const requestKey = buildInlineCompletionRequestKey({
          filePath,
          language,
          versionId: model.getVersionId(),
          offset,
        });
        latestObservedRequest = {
          key: requestKey,
          filePath,
          language,
          prefix,
          suffix,
        };

        if (prefix.trim().length < MIN_PREFIX_LENGTH) {
          return { items: [] };
        }

        if (
          cachedResolvedRequest?.key === requestKey
          && cachedResolvedRequest.result.ok
          && cachedResolvedRequest.result.text.trim()
        ) {
          console.debug("[inline-comp] using cached result");
          return buildInlineCompletionItems(position, cachedResolvedRequest.result.text);
        }

        const reusedCompletionFromPrevious = deriveInlineCompletionFromPrevious({
          filePath,
          language: model.getLanguageId(),
          prefix,
          suffix,
        });
        if (reusedCompletionFromPrevious) {
          console.debug(
            reusedCompletionFromPrevious.kind === "exact"
              ? "[inline-comp] reusing previous completion"
              : reusedCompletionFromPrevious.kind === "tail"
                ? "[inline-comp] reusing previous completion tail"
                : "[inline-comp] reusing transformed completion state",
          );
          return buildInlineCompletionItems(position, reusedCompletionFromPrevious.text);
        }

        let result: InlineCompletionResponse;
        let exactRequestMatch = false;
        let resolvedSnapshot: ResolvedInlineCompletionSnapshot | null = null;
        let awaitedRequest: PendingInlineCompletionRequest | null = null;
        let settledActiveRequest = false;
        let scheduledRefresh = false;
        const scheduleRefresh = (reason: string) => {
          if (scheduledRefresh) {
            return;
          }
          scheduledRefresh = true;
          console.debug(reason);
          scheduleInlineCompletionRefresh({
            changeEmitter,
            triggerInlineSuggestRefresh: args.triggerInlineSuggestRefresh,
          });
        };

        try {
          while (true) {
            if (token.isCancellationRequested) {
              return { items: [] };
            }

            if (inFlightRequest?.key === requestKey) {
              logInFlightReuse(inFlightRequest, "exact");
              awaitedRequest = inFlightRequest;
              exactRequestMatch = true;
              result = await inFlightRequest.promise;
              break;
            }

            if (
              inFlightRequest
              && canReuseInlineCompletionSnapshot(inFlightRequest, {
                filePath,
                language,
                prefix,
                suffix,
              })
            ) {
              logInFlightReuse(inFlightRequest, "compatible");
              awaitedRequest = inFlightRequest;
              result = await inFlightRequest.promise;
              break;
            }

            if (inFlightRequest) {
              try {
                await inFlightRequest.promise;
              } catch {
                // Ignore upstream failures here; the next loop iteration will decide whether to retry.
              }
              continue;
            }

            const adaptiveDebounceMs = getAdaptiveDebounceMs({ filePath, language });
            const shouldContinue = await waitForAdaptiveDebounce(adaptiveDebounceMs, token);
            if (!shouldContinue) {
              return { items: [] };
            }

            if (inFlightRequest) {
              continue;
            }

            console.debug("[inline-comp] requesting completion");
            const promise = requestFn({
              prefix,
              suffix,
              filePath,
              language,
            });
            inFlightRequest = {
              key: requestKey,
              filePath,
              language,
              prefix,
              suffix,
              startedAt: Date.now(),
              promise,
            };
            awaitedRequest = inFlightRequest;
            exactRequestMatch = true;
            result = await promise;
            break;
          }
        } catch (err) {
          console.warn("[inline-comp] error:", err);
          return { items: [] };
        } finally {
          if (awaitedRequest && inFlightRequest?.promise === awaitedRequest.promise) {
            inFlightRequest = null;
            settledActiveRequest = true;
          }
          if (awaitedRequest && lastLoggedInFlightRequest?.promise === awaitedRequest.promise) {
            lastLoggedInFlightRequest = null;
          }
        }

        resolvedSnapshot = result.ok && result.text.trim()
          ? {
              filePath: awaitedRequest?.filePath ?? filePath,
              language: awaitedRequest?.language ?? language,
              prefix: awaitedRequest?.prefix ?? prefix,
              suffix: awaitedRequest?.suffix ?? suffix,
              text: result.text,
            }
          : null;
        cachedResolvedRequest = exactRequestMatch && resolvedSnapshot
          ? {
              key: requestKey,
              result,
            }
          : exactRequestMatch
            ? null
            : cachedResolvedRequest;
        lastResolvedCompletion = resolvedSnapshot ?? lastResolvedCompletion;

        const projectedLatestRequestResult = projectResolvedSnapshotToLatestRequest(resolvedSnapshot, requestKey);
        if (projectedLatestRequestResult) {
          cachedResolvedRequest = projectedLatestRequestResult;
        }

        console.debug("[inline-comp] settled:", result.ok, result.error ?? "", result.text.slice(0, 80));

        if (settledActiveRequest && awaitedRequest) {
          recordAdaptiveDebounceSample(
            {
              filePath: awaitedRequest.filePath,
              language: awaitedRequest.language,
            },
            Math.max(1, Date.now() - awaitedRequest.startedAt),
          );
        }

        if (token.isCancellationRequested) {
          if (resolvedSnapshot) {
            scheduleRefresh("[inline-comp] late result arrived, scheduling async refresh");
          }
          return { items: [] };
        }

        if (projectedLatestRequestResult) {
          scheduleRefresh("[inline-comp] projected settled result to latest request");
          return { items: [] };
        }

        if (result.error === "aborted") {
          return { items: [] };
        }

        console.debug("[inline-comp] result:", result.ok, result.error ?? "", result.text.slice(0, 80));

        if (!result.ok || !result.text.trim()) {
          return { items: [] };
        }

        if (exactRequestMatch) {
          return buildInlineCompletionItems(position, result.text);
        }

        const reusedCompletionFromInFlight = deriveInlineCompletionFromSnapshot(resolvedSnapshot, {
          filePath,
          language,
          prefix,
          suffix,
        });
        if (!reusedCompletionFromInFlight) {
          return { items: [] };
        }

        console.debug(
          reusedCompletionFromInFlight.kind === "exact"
            ? "[inline-comp] reusing previous completion"
            : reusedCompletionFromInFlight.kind === "tail"
              ? "[inline-comp] reusing previous completion tail"
              : "[inline-comp] reusing transformed completion state",
        );
        return buildInlineCompletionItems(position, reusedCompletionFromInFlight.text);
      },

      disposeInlineCompletions() {
        // No resources to dispose
      },
      debounceDelayMs: MONACO_DEBOUNCE_MS,
    },
  );
}

export function disposeInlineCompletions() {
  registeredDisposable?.dispose();
  registeredDisposable = null;
  inFlightRequest = null;
  cachedResolvedRequest = null;
  lastResolvedCompletion = null;
  debounceSamplesByBucket = new Map();
  inlineCompletionChangeEmitter?.dispose();
  inlineCompletionChangeEmitter = null;
  lastLoggedInFlightRequest = null;
  latestObservedRequest = null;
}
