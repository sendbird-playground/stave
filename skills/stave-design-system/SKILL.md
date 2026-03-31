---
name: stave-design-system
description: Apply Stave's desktop-first design system when a task changes UI, layout, theme, dialogs, sidebars, empty states, settings, prompt input, or other visual UX in this repo. Use for prompts like "디자인", "UI", "redesign", "polish", "sidebar", "dialog", "settings", or whenever a new interface pattern is introduced. Preserve the existing shadcn and token architecture, keep glass treatments restrained, and favor dense, readable desktop workflows over decorative novelty.
compatible-tools: [claude, codex]
category: design
test-prompts:
  - "Stave settings dialog UI 다듬어줘"
  - "redesign the workspace sidebar for better density"
  - "새 empty state 추가하는데 기존 디자인 시스템에 맞춰줘"
  - "polish this dialog without drifting from Stave's visual language"
---

# Stave Design System

Repository-local design skill for Stave's user-facing surfaces.

## Mission

Design for an AI coding workspace first: strong information hierarchy, fast scanning, compact but readable density, consistent light and dark themes, and low-friction keyboard-friendly interaction.

The goal is not "make it glassy." The goal is a calm, sharp desktop workspace that uses depth only where it improves orientation.

## Read First

- `src/globals.css` for tokens, fonts, radius, motion, and existing liquid-glass utilities
- `src/components/ui/` for shared shadcn primitives
- the nearest existing file under `src/components/layout/` or `src/components/session/`
- `src/components/layout/settings-dialog-sections.tsx` when theme tokens, settings surfaces, or preset-facing copy is involved
- `components.json` and `docs/ui/shadcn-preset.md` when applying or changing shadcn preset behavior

## Core Visual Rules

- Prefer the current semantic token system over raw hex, rgba, or one-off gradients.
- Preserve the existing Stave palette direction from `src/globals.css`, including the green primary accent and current neutral/editor/sidebar surfaces.
- Use the existing font tokens. Do not introduce new product fonts unless the user explicitly asks.
- Optimize for desktop density first, then verify narrower splits and mobile widths where the current product already supports them.
- Keep radii moderate and purposeful. Avoid overly pill-shaped or consumer-marketing styling.
- Keep surfaces legible before they are expressive.

## Glass and Depth

- Treat glassmorphism as a restrained accent, not a blanket theme.
- Reuse existing depth patterns such as `.sidebar-liquid-glass`, `.sidebar-liquid-panel`, translucent cards, and `supports-backdrop-filter:backdrop-blur-xl` popovers before inventing new ones.
- Reserve stronger blur or luminous edge treatment for shells, sidebars, floating panels, popovers, drawers, and overlays that benefit from separation.
- Default content surfaces should remain solid or lightly translucent so text, diffs, logs, and controls stay crisp.
- If a glass treatment hurts contrast, scrolling readability, or performance, remove it.

## Interaction Rules

- Make state obvious through hierarchy, spacing, tokenized color, border, icon, label, and placement before adding motion.
- New interactive controls must define applicable states: default, hover, focus-visible, active, disabled, loading, and error.
- Keyboard access and visible focus styles are mandatory.
- Keep motion brief and functional. Respect reduced-motion behavior already defined in `src/globals.css`.
- Prefer stable layouts during async work; use skeletons, muted placeholders, or reserved space instead of jumpy reflow.

## Stave-Specific Product Guidance

- Favor layouts that help users manage tasks, workspaces, branches, files, and agent output without losing context.
- Dense does not mean cramped: keep grouping clear and use whitespace to separate functional clusters, not to create airy marketing spacing.
- Visual emphasis should track product importance:
  - task and workspace identity first
  - current action and status second
  - secondary metadata third
- Use semantic status colors for warnings, destructive actions, success, and provider identity. Do not add a new accent family unless there is a real product meaning for it.
- Empty, loading, and error states should be useful and operational, not ornamental.

## Implementation Workflow

1. Inspect the nearest existing surface before proposing a new pattern.
2. Reuse shared primitives and semantic tokens first.
3. If a new visual pattern is necessary, encode it as a reusable utility, shared component, or token-backed treatment instead of a one-off class pile.
4. Check the result in both light and dark themes.
5. Check at desktop width and at narrower split-panel widths when the surface can appear there.
6. If the work changes design-system behavior or preset-facing copy, update the related documentation in the same change.

## Do

- keep visual hierarchy obvious at a glance
- use subtle layering and contrast shifts instead of loud decoration
- prefer shared patterns already present in Stave
- align new UI with task-oriented desktop workflows
- keep implementation grounded in tokens, shadcn primitives, and existing layout language

## Don't

- do not port a generic glassmorphism system wholesale
- do not switch the app to a blue-first or neon palette without explicit direction
- do not introduce raw color values when a semantic token already exists
- do not use blur, glow, shadow, or gradients on every surface
- do not sacrifice density or clarity for visual spectacle
- do not add a new visual metaphor that fights the rest of the app

## QA Checklist

- Does the change read clearly in both light and dark mode?
- Does it preserve Stave's current token and component system?
- Is glass or blur used only where depth materially helps?
- Are keyboard focus and disabled/loading/error states clear?
- Does the layout still work in narrower split-panel widths?
- If design-system behavior changed, were the relevant docs and preset references updated too?
