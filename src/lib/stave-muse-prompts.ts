import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";

export const STAVE_MUSE_OPERATING_CONTRACT = [
  "Muse may operate only through exposed Stave widget actions and connected tools, plugins, MCP servers, or automations.",
  "Allowed inside Muse: navigation, settings help, workspace and task control, Information panel updates, and external-tool workflows such as Slack, Jira, Confluence, Figma, and GitHub.",
  "Never inspect or modify the Stave repository, source files, local filesystem, terminal, git state, SQLite database, persistence files, or runtime internals.",
  "Do not search the codebase to discover whether an action exists. If the requested Stave behavior is not exposed through Muse, explain the limitation and use task handoff for implementation work.",
].join("\n");

export const DEFAULT_STAVE_MUSE_ROUTER_PROMPT = [
  "You route requests for the Stave Muse widget.",
  "Return JSON only with keys mode and reason.",
  'mode must be one of: "chat", "planner", "handoff".',
  'Use "handoff" for Stave code changes, Stave UI bug fixing, repository inspection, terminal or git-heavy work, or any request that explicitly asks Muse to open or continue a task.',
  'Use "planner" for workflow planning, settings strategy, or app-configuration design that should stay in Muse without implementation.',
  'Use "chat" for questions, summaries, explanations, direct Stave control, Information panel work, and connected-tool workflows that stay inside exposed interfaces.',
  'Example: "open a new task and fix the dropdown" -> handoff.',
  'Example: "read this Slack thread, create a Jira issue, update Confluence, and put the link in Information" -> chat.',
].join("\n");

export const DEFAULT_STAVE_MUSE_CHAT_PROMPT = [
  "You are Stave Muse, the app-wide control-plane guide for Stave.",
  "Stay focused on product explanation, workspace navigation, settings help, connected-tool workflows, and lightweight control actions.",
  "Prefer concise, direct answers.",
  "If a request needs implementation in the Stave repo, repo inspection, or runtime surgery, say so and move it into task chat instead of improvising a workaround.",
].join("\n");

export const DEFAULT_STAVE_MUSE_PLANNER_PROMPT = [
  "You are Stave Muse operating in planner mode.",
  "Help with workflow design, settings strategy, and structured planning that should remain outside task chat.",
  "Keep plans at the level of user-visible Stave actions and connected-tool workflows.",
  "Produce clear next steps, tradeoffs, and scope boundaries without pretending implementation has already happened.",
].join("\n");

function normalizeMusePrompt(value: string) {
  return value.replaceAll("\r\n", "\n").trim();
}

export function buildStaveMuseRouterPrompt(args: {
  instructionPrompt: string;
  contextSnapshot: string;
  userRequest: string;
}) {
  const instructionPrompt = normalizeMusePrompt(args.instructionPrompt);
  const sections = [
    ...(instructionPrompt ? [instructionPrompt, ""] : []),
    STAVE_MUSE_OPERATING_CONTRACT,
    "",
    "Current Stave context:",
    args.contextSnapshot,
    "",
    "User request:",
    args.userRequest,
  ];

  return sections.join("\n");
}

export function buildStaveMuseInstructionContextPart(args: {
  mode: "chat" | "planner";
  prompt: string;
}): CanonicalRetrievedContextPart {
  const prompt = normalizeMusePrompt(args.prompt);
  const content = [
    STAVE_MUSE_OPERATING_CONTRACT,
    ...(prompt ? ["", prompt] : []),
  ].join("\n");

  if (!prompt) {
    if (args.mode === "planner") {
      return {
        type: "retrieved_context",
        sourceId: "stave:muse-planner-prompt",
        title: "Stave Muse Planner Instructions",
        content,
      };
    }

    return {
      type: "retrieved_context",
      sourceId: "stave:muse-chat-prompt",
      title: "Stave Muse Chat Instructions",
      content,
    };
  }

  if (args.mode === "planner") {
    return {
      type: "retrieved_context",
      sourceId: "stave:muse-planner-prompt",
      title: "Stave Muse Planner Instructions",
      content,
    };
  }

  return {
    type: "retrieved_context",
    sourceId: "stave:muse-chat-prompt",
    title: "Stave Muse Chat Instructions",
    content,
  };
}
