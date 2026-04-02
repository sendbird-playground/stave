import { useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";
import type { UserInputQuestion } from "@/types/chat";

interface UserInputCardProps {
  toolName: string;
  questions: UserInputQuestion[];
  state: "input-requested" | "input-responded" | "input-denied";
  answers?: Record<string, string>;
  onSubmit?: (answers: Record<string, string>) => void;
  onDeny?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

function parseAnswerValue(args: { value?: string; multiSelect?: boolean; optionLabels: string[] }) {
  const raw = args.value?.trim() ?? "";
  if (!raw) {
    return { selected: [] as string[], custom: "" };
  }
  const parts = args.multiSelect ? raw.split(",").map((part) => part.trim()).filter(Boolean) : [raw];
  const selected = parts.filter((part) => args.optionLabels.includes(part));
  const custom = parts.filter((part) => !args.optionLabels.includes(part)).join(", ");
  return { selected, custom };
}

export function UserInputCard(args: UserInputCardProps) {
  const { toolName, questions, state, answers, onSubmit, onDeny, disabled, disabledReason } = args;
  const initialSelectionByQuestion = useMemo(() => Object.fromEntries(
    questions.map((question) => {
      const parsed = parseAnswerValue({
        value: answers?.[question.question],
        multiSelect: question.multiSelect,
        optionLabels: question.options.map((option) => option.label),
      });
      return [question.question, parsed];
    }),
  ), [answers, questions]);
  const [selectionByQuestion, setSelectionByQuestion] = useState(initialSelectionByQuestion);

  const compiledAnswers = useMemo(() => Object.fromEntries(
    questions.flatMap((question) => {
      const selection = selectionByQuestion[question.question] ?? { selected: [], custom: "" };
      const values = [...selection.selected];
      if (selection.custom.trim()) {
        values.push(selection.custom.trim());
      }
      if (values.length === 0) {
        return [];
      }
      return [[question.question, values.join(", ")]];
    }),
  ) as Record<string, string>, [questions, selectionByQuestion]);

  const isReady = questions.every((question) => Boolean(compiledAnswers[question.question]?.trim()));

  return (
    <div className="rounded-md border bg-card p-3 text-[0.875em]">
      <p className="font-semibold text-foreground">Input requested: {toolName}</p>
      {state === "input-requested" ? (
        <>
          <div className="mt-3 space-y-4">
            {questions.map((question) => {
              const selection = selectionByQuestion[question.question] ?? { selected: [], custom: "" };
              return (
                <div key={question.question} className="space-y-2">
                  <div>
                    <p className="text-[0.75em] font-medium uppercase tracking-wide text-muted-foreground">{question.header}</p>
                    <p className="mt-1 text-foreground">{question.question}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => {
                      const isSelected = selection.selected.includes(option.label);
                      return (
                        <Button
                          key={option.label}
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          disabled={disabled}
                          onClick={() => {
                            setSelectionByQuestion((current) => {
                              const prev = current[question.question] ?? { selected: [], custom: "" };
                              const nextSelected = question.multiSelect
                                ? (isSelected
                                  ? prev.selected.filter((label) => label !== option.label)
                                  : [...prev.selected, option.label])
                                : [option.label];
                              return {
                                ...current,
                                [question.question]: {
                                  ...prev,
                                  selected: nextSelected,
                                },
                              };
                            });
                          }}
                          title={option.description}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-[0.75em] text-muted-foreground">
                    {question.multiSelect ? "Choose one or more options. Add custom text if needed." : "Choose one option or provide custom text."}
                  </p>
                  <Input
                    value={selection.custom}
                    disabled={disabled}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectionByQuestion((current) => ({
                        ...current,
                        [question.question]: {
                          ...(current[question.question] ?? { selected: [], custom: "" }),
                          custom: value,
                        },
                      }));
                    }}
                    placeholder="Other"
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" disabled={disabled || !isReady} onClick={() => onSubmit?.(compiledAnswers)}>
              Submit answers
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={onDeny}>
              Decline
            </Button>
          </div>
          {disabledReason ? (
            <p className="mt-2 text-[0.75em] text-muted-foreground">{disabledReason}</p>
          ) : null}
        </>
      ) : state === "input-denied" ? (
        <p className="mt-2 text-muted-foreground">Decision: user declined to answer.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {questions.map((question) => (
            <div key={question.question}>
              <p className="text-[0.75em] font-medium uppercase tracking-wide text-muted-foreground">{question.header}</p>
              <p className="mt-1 text-foreground">{question.question}</p>
              <p className="mt-1 text-muted-foreground">{answers?.[question.question] ?? "No answer provided."}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
