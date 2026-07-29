#!/usr/bin/env bash
#
# One-shot Android/Java toolchain setup for this project on macOS (Apple Silicon).
#
# This is the script that was actually run to provision the development machine —
# not a reconstruction. It is idempotent: re-running it is safe.
#
# Why each piece is needed:
#   - React Native 0.86.2's Android Gradle Plugin requires JDK 17 exactly. Newer JDKs
#     (e.g. 23) are not a supported Gradle/AGP toolchain and fail the build.
#   - The *legacy* SDK tools shipped in older SDK installs are broken under JDK 11+
#     (`NoClassDefFoundError: javax/xml/bind/annotation/XmlSchema`), so the modern
#     `cmdline-tools` package is required before any SDK package can be installed.
#   - The SDK versions below are read from the `@react-native-community/template@0.86.2`
#     tarball, NOT from the docs — the official "set up your environment" page still
#     says SDK Platform 35 while the template compiles against 36.
#
set -euo pipefail

# --- Versions pinned to React Native 0.86.2's template -----------------------
readonly NDK_VERSION="27.1.12297006"
readonly BUILD_TOOLS="36.0.0"
readonly COMPILE_SDK="36"
readonly FALLBACK_SDK="35"   # docs still reference 35; install both to be safe
readonly SYSTEM_IMAGE="system-images;android-36;google_apis;arm64-v8a"
readonly AVD_NAME="rn_pixel7_api36"

readonly ANDROID_SDK="$HOME/Library/Android/sdk"
readonly CMDLINE_TOOLS_BIN="/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin"
readonly JDK17_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
readonly ZSHRC="$HOME/.zshrc"
readonly BLOCK_START="# >>> modulus-todo-app: Android/Java toolchain >>>"
readonly BLOCK_END="# <<< modulus-todo-app: Android/Java toolchain <<<"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# --- Preflight: fail early rather than halfway through a 10GB download -------
log "Preflight checks"
command -v brew >/dev/null || { echo "Homebrew is required: https://brew.sh"; exit 1; }

avail_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
echo "Free disk: ${avail_gb}GB"
if (( avail_gb < 25 )); then
  echo "ERROR: need ~25GB free (SDK ~10GB, Gradle caches ~5GB, node_modules ~1.5GB)." >&2
  exit 1
fi

# --- Toolchain packages ------------------------------------------------------
# NOTE: install these serially. Two concurrent `brew install` runs will deadlock
# on a shared download lock (e.g. pcre2) and fail with a confusing error.
log "Installing JDK 17, Android cmdline-tools, watchman, git-lfs"
# openjdk@17 is a *formula* (installs under /opt/homebrew, no sudo), unlike the
# temurin@17 cask which installs a system .pkg and prompts for a password.
brew list --versions openjdk@17 >/dev/null 2>&1 || brew install openjdk@17
brew list --cask android-commandlinetools >/dev/null 2>&1 || brew install --cask android-commandlinetools
brew list --versions watchman >/dev/null 2>&1 || brew install watchman
# git-lfs: this machine had LFS filters registered globally with no binary present,
# which breaks any clone of an LFS-enabled repo.
brew list --versions git-lfs >/dev/null 2>&1 || brew install git-lfs

# --- Shell environment -------------------------------------------------------
log "Writing environment block to ~/.zshrc"
if grep -qF "$BLOCK_START" "$ZSHRC" 2>/dev/null; then
  echo "Block already present; leaving as-is."
else
  cat >> "$ZSHRC" <<EOF

$BLOCK_START
export JAVA_HOME="$JDK17_HOME"
export ANDROID_HOME="\$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="\$ANDROID_HOME"
export PATH="\$JAVA_HOME/bin:\$PATH"
export PATH="\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH"
export PATH="$CMDLINE_TOOLS_BIN:\$PATH"
$BLOCK_END
EOF
  echo "Appended."
fi

export JAVA_HOME="$JDK17_HOME"
export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"
export PATH="$JAVA_HOME/bin:$CMDLINE_TOOLS_BIN:$ANDROID_SDK/platform-tools:$ANDROID_SDK/emulator:$PATH"

# --- SDK packages ------------------------------------------------------------
log "Installing SDK packages (~10GB, this is the slow part)"
yes | sdkmanager --sdk_root="$ANDROID_SDK" \
  "platform-tools" \
  "platforms;android-${COMPILE_SDK}" \
  "platforms;android-${FALLBACK_SDK}" \
  "build-tools;${BUILD_TOOLS}" \
  "ndk;${NDK_VERSION}" \
  "emulator" \
  "$SYSTEM_IMAGE"

# --- Emulator ----------------------------------------------------------------
# The pre-existing AVD on this machine had 1536MB RAM, which is too small to run a
# Metro debug build without thrashing.
log "Creating AVD: $AVD_NAME"
if avdmanager list avd 2>/dev/null | grep -q "Name: ${AVD_NAME}$"; then
  echo "AVD already exists; skipping."
else
  echo "no" | avdmanager create avd \
    --name "$AVD_NAME" \
    --package "$SYSTEM_IMAGE" \
    --device "pixel_7" \
    --force
  avd_cfg="$HOME/.android/avd/${AVD_NAME}.avd/config.ini"
  # 4GB RAM + 2GB internal storage: enough headroom for Metro + Hermes.
  sed -i '' 's/^hw.ramSize=.*/hw.ramSize=4096/' "$avd_cfg" 2>/dev/null || echo "hw.ramSize=4096" >> "$avd_cfg"
  { echo "disk.dataPartition.size=2048M"; echo "hw.keyboard=yes"; } >> "$avd_cfg"
fi

# --- MongoDB -----------------------------------------------------------------
log "Starting MongoDB"
# Homebrew 5.x refuses to load formulae from untrusted third-party taps.
brew trust mongodb/brew >/dev/null 2>&1 || true
brew services start mongodb-community >/dev/null 2>&1 || echo "(already running)"

# --- Git ---------------------------------------------------------------------
log "Git defaults"
git config --global init.defaultBranch main

# --- Verification ------------------------------------------------------------
log "Verifying (these are the Phase 0 exit criteria)"
java -version 2>&1 | head -1
echo "JAVA_HOME=$JAVA_HOME"
echo "ANDROID_HOME=$ANDROID_HOME"
sdkmanager --sdk_root="$ANDROID_SDK" --list_installed 2>/dev/null \
  | grep -E "ndk;|build-tools;${BUILD_TOOLS}|platforms;android-3[56]|${SYSTEM_IMAGE}" || true
echo "AVDs: $(avdmanager list avd 2>/dev/null | grep 'Name:' | tr -d ' ' | tr '\n' ' ')"
mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null || echo "WARN: mongod not responding"

log "Done. Open a NEW terminal so ~/.zshrc is re-sourced."
echo "Start the emulator with:  emulator -avd $AVD_NAME &"
