# Install Guide

Internal macOS installation for Stave is optimized around GitHub CLI authentication rather than double-clicking a downloaded helper.

## Prerequisites

- macOS with the built-in `ditto`, `xattr`, and `open` commands available
- [`gh` CLI](https://cli.github.com/)
- a GitHub account that can access `sendbird-playground/stave`

## First-Time Setup

Install GitHub CLI if needed:

```bash
brew install gh
```

Authenticate and verify access:

```bash
gh auth login
gh auth status
```

If your organization requires SSO re-authorization or refreshed scopes, run:

```bash
gh auth refresh -h github.com -s repo,read:org
```

## One-Command Install

Once `gh` is authenticated, install the latest Stave release with:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/install-latest-release.sh | bash
```

That installer script:

- downloads the latest `Stave-macOS.zip` release asset
- extracts the bundle into a temporary directory
- stages the new bundle before replacing the existing app so a failed update can recover cleanly
- prefers the current writable install location and otherwise falls back to `~/Applications`
- removes the macOS quarantine attribute from the installed app
- opens Stave after installation

## In-App Update Button

Packaged macOS builds also show an app update action in the top bar.

- It checks the latest authenticated GitHub release for `sendbird-playground/stave`
- It compares that tag against the installed app version
- If a newer release is available, it can install the update and restart Stave automatically

This uses the same authenticated `gh`-based release flow as the terminal installer, so `gh auth login` is still required.

On packaged macOS builds, the restart helper also carries a Homebrew-friendly PATH so GUI-launched Stave can still find `gh` during the install step.

If macOS keeps re-asking for Desktop, Documents, or Downloads access after install or update, see [macOS Folder Access Prompts](features/macos-folder-access-prompts.md).

## Automatic Daily Updates

Keep Stave up-to-date automatically with a macOS LaunchAgent that checks for new releases every day at 10:00 AM:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash
```

This registers a daily background task that:

- compares the installed version against the latest GitHub release
- installs the update silently into the detected writable app location if a new version is available
- skips the check when the version is already current
- logs all activity to `~/Library/Logs/Stave/auto-update.log`

If your Mac is asleep at 10:00 AM, macOS runs the check as soon as the machine wakes up.

To check status:

```bash
launchctl print gui/$(id -u)/com.stave.app.auto-update
```

To uninstall:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash -s -- uninstall
```

## Manual Fallback

If you need the release bundle directly, download `Stave-macOS.zip` from the latest release.

The bundle contains:

- `Stave.app`
- `Install Stave.command`
- `Install Stave in Terminal.txt`

That path remains available as an offline/manual fallback, but the `gh` installer is the preferred internal install flow.
