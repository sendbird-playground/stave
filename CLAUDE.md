<!-- Claude Code project instructions -->

See [AGENTS.md](./AGENTS.md) for the authoritative project policy.

## Claude-specific guidance

- `app.store.ts` is ~2 100 lines. Read targeted sections with offset/limit instead of loading the whole file.
- When modifying provider runtimes, always check **both** `claude-sdk-runtime.ts` and `codex-sdk-runtime.ts` for symmetry.
- Run `bun test` after code changes to verify nothing is broken.
- Prefer the `Agent` tool with `subagent_type: "Explore"` for open-ended codebase searches rather than manual glob/grep chains.
- **Theme system**: Any UI work — layout, components, colours, surfaces, shadcn presets — must verify and update `src/lib/themes/` (types, presets, built-in themes) and `src/globals.css`. This applies to the base light/dark system **and** custom themes equally. See the "Theme System" section in `AGENTS.md` for the full checklist.

## Release and Push Requests

- Repository-local copy: `skills/stave-release/SKILL.md`
- Treat `$stave-release` as the Stave release workflow trigger.
- Use `$stave-release` only when the user explicitly asks to release, ship, publish, version, or generate release notes for a release PR.
- If the user only asks to commit, push, or commit and push current work, use a normal git commit/push flow instead.
- For ordinary commit/push requests, do not bump `package.json`, do not touch `CHANGELOG.md`, and do not create or move semver release tags unless the user explicitly asks for release work.
