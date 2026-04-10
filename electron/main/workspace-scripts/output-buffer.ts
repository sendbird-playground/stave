export interface ScriptOutputBuffer {
  push(chunk: string): void;
  flush(): void;
}

export function createScriptOutputBuffer(
  onFlush: (output: string) => void,
): ScriptOutputBuffer {
  let pending = "";
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (!pending) {
      return;
    }
    const output = pending;
    pending = "";
    onFlush(output);
  };

  return {
    push(chunk: string) {
      if (!chunk) {
        return;
      }
      pending += chunk;
      if (!scheduled) {
        scheduled = true;
        setImmediate(flush);
      }
    },
    flush,
  };
}
