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

## Manual Fallback

If you need the release bundle directly, download `Stave-macOS.zip` from the latest release.

The bundle contains:

- `Stave.app`
- `Install Stave.command`
- `Install Stave in Terminal.txt`

That path remains available as an offline/manual fallback, but the `gh` installer is the preferred internal install flow.
