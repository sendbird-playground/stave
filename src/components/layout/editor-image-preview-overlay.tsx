import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

export function EditorImagePreviewOverlay(args: {
  open: boolean;
  imageSrc: string;
  alt: string;
  onClose: () => void;
}) {
  if (!args.open) {
    return null;
  }

  return (
    <div
      className={cn(UI_LAYER_CLASS.lightbox, "fixed inset-0 flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]")}
      role="dialog"
      aria-modal="true"
      aria-label="Image full screen preview"
      onClick={args.onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
        onClick={(event) => {
          event.stopPropagation();
          args.onClose();
        }}
      >
        Close
      </button>
      <img
        src={args.imageSrc}
        alt={args.alt}
        className="max-h-full max-w-full cursor-zoom-out object-contain"
        title="Click to close full screen"
        onClick={(event) => {
          event.stopPropagation();
          args.onClose();
        }}
      />
    </div>
  );
}
