#!/bin/bash
set -euo pipefail

APP_NAME="${STAVE_APP_NAME:-Stave}"
REPO="${STAVE_REPO:-sendbird-playground/stave}"
ASSET_NAME="${STAVE_RELEASE_ASSET:-Stave-macOS.zip}"
INSTALL_DIR="${STAVE_INSTALL_DIR:-$HOME/Applications}"
WORK_DIR="$(mktemp -d -t stave-install.XXXXXX)"
ARCHIVE_PATH="${WORK_DIR}/${ASSET_NAME}"
EXTRACT_DIR="${WORK_DIR}/extracted"
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"

info() {
  printf "==> %s\n" "$1"
}

error() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

cleanup() {
  rm -rf "$WORK_DIR"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1"
  fi
}

trap cleanup EXIT

require_command gh
require_command ditto
require_command xattr
require_command open

if ! gh auth status >/dev/null 2>&1; then
  error "GitHub CLI is not authenticated. Run 'gh auth login' first and ensure your account can access ${REPO}."
fi

info "Resolving latest release for ${REPO}..."
TAG_NAME="$(gh release view --repo "$REPO" --json tagName --jq '.tagName')"
if [ -z "$TAG_NAME" ]; then
  error "Failed to resolve the latest release tag for ${REPO}."
fi
info "Latest release: ${TAG_NAME}"

mkdir -p "$EXTRACT_DIR"

info "Downloading ${ASSET_NAME}..."
gh release download --repo "$REPO" --pattern "$ASSET_NAME" --dir "$WORK_DIR" --clobber >/dev/null

if [ ! -f "$ARCHIVE_PATH" ]; then
  error "Downloaded asset not found: ${ARCHIVE_PATH}"
fi

info "Extracting ${ASSET_NAME}..."
ditto -x -k "$ARCHIVE_PATH" "$EXTRACT_DIR"

SOURCE_APP="$(find "$EXTRACT_DIR" -maxdepth 2 -type d -name "${APP_NAME}.app" | head -n 1 || true)"
if [ -z "$SOURCE_APP" ] || [ ! -d "$SOURCE_APP" ]; then
  error "Expected ${APP_NAME}.app in the extracted release bundle, but it was not found."
fi

mkdir -p "$INSTALL_DIR"

if [ -d "$TARGET_APP" ]; then
  info "Removing existing installation..."
  rm -rf "$TARGET_APP"
fi

info "Installing ${APP_NAME} into ${INSTALL_DIR}..."
cp -R "$SOURCE_APP" "$TARGET_APP"

info "Removing quarantine attribute..."
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

info "Opening ${APP_NAME}..."
open "$TARGET_APP"

info "${APP_NAME} ${TAG_NAME} installed successfully."
printf "Open later with: open %s\n" "$(printf '%q' "$TARGET_APP")"
