import { memo, useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Button, Card, Input } from "@/components/ui";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function readInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function readFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function SectionHeading(args: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-2xl font-semibold tracking-tight">{args.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{args.description}</p>
    </div>
  );
}

export function SectionStack(args: { children: ReactNode }) {
  return <section className="flex flex-col gap-4">{args.children}</section>;
}

export function SettingsCard(args: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/80 bg-card/90 shadow-xs", args.className)}>
      <CardHeader className="pb-2.5">
        <CardTitle className="text-base">{args.title}</CardTitle>
        {args.description ? <CardDescription>{args.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3.5">{args.children}</CardContent>
    </Card>
  );
}

export function ChoiceButtons<T extends string>(args: {
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className={cn("grid gap-2", args.columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {args.options.map((option) => (
        <Button
          key={option.value}
          className="h-9 rounded-md"
          variant={args.value === option.value ? "default" : "outline"}
          onClick={() => args.onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function LabeledField(args: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <p className="text-sm font-medium">{args.title}</p>
        {args.description ? <p className="text-sm text-muted-foreground">{args.description}</p> : null}
      </div>
      {args.children}
    </div>
  );
}

type DraftInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

export const DraftInput = memo(function DraftInput(args: DraftInputProps) {
  const { value, onCommit, onBlur, onKeyDown, ...inputProps } = args;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (nextValue: string) => {
    if (nextValue === value) {
      return;
    }
    onCommit(nextValue);
  };

  return (
    <Input
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit(event.currentTarget.value);
        }
        onKeyDown?.(event);
      }}
    />
  );
});
