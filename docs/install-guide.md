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
- copies `Stave.app` into `~/Applications`
- removes the macOS quarantine attribute from the installed app
- opens Stave after installation

## Automatic Daily Updates

Keep Stave up-to-date automatically with a macOS LaunchAgent that checks for new releases every day at 10:00 AM:

```bash
gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/setup-auto-update.sh | bash
```

This registers a daily background task that:

- compares the installed version against the latest GitHub release
- downloads and installs the update silently if a new version is available
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
