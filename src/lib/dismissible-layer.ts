import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

type DismissibleLayerContainer = {
  contains?: (other: Node | null) => boolean;
  focus?: () => void;
  ownerDocument?: {
    activeElement?: Element | null;
  };
};

export function shouldDismissLayerFromEscape(args: {
  key: string;
  defaultPrevented?: boolean;
}) {
  return args.key === "Escape" && !args.defaultPrevented;
}

export function focusDismissibleLayer(args: {
  container: DismissibleLayerContainer | null | undefined;
}) {
  const container = args.container;
  if (!container || typeof container.focus !== "function") {
    return false;
  }

  const activeElement = container.ownerDocument?.activeElement;
  if (activeElement && typeof container.contains === "function" && container.contains(activeElement)) {
    return false;
  }

  container.focus();
  return true;
}

export function useDismissibleLayer<T extends HTMLElement = HTMLElement>(args: {
  enabled: boolean;
  onDismiss: () => void;
}) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!args.enabled) {
      return;
    }
    focusDismissibleLayer({ container: containerRef.current });
  }, [args.enabled]);

  function handleKeyDown(event: ReactKeyboardEvent<T>) {
    if (!shouldDismissLayerFromEscape({
      key: event.key,
      defaultPrevented: event.isDefaultPrevented(),
    })) {
      return;
    }

    event.preventDefault();
    args.onDismiss();
  }

  return {
    containerRef,
    handleKeyDown,
  };
}
