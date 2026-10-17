#!/usr/bin/env bash
# Origami Reader, private beta: Linux installer.
#
# Builds the reader from the included source on this computer, sets up local
# speech (English voices, Qwen3-TTS 0.6B) and, optionally, cover and portrait
# artwork. Everything is installed for this user only, in
#   ~/.local/share/origami-reader        (the program)
#   ~/.config/app.origami.reader         (its settings files)
# Your library lives in ~/.local/share/app.origami.reader and is never touched.
#
#   ./install-linux.sh            interactive
#   ./install-linux.sh --yes      accept every step
#   ./install-linux.sh --no-images   skip cover and portrait artwork
#
# A full log is written to ~/origami-install.log; please send it if anything
# goes wrong.

set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${ORIGAMI_PREFIX:-$HOME/.local/share/origami-reader}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/app.origami.reader"
TOOLS="$HOME/.cache/origami-build-tools"
LOG="$HOME/origami-install.log"
SD_REVISION="d637cfb"   # stable-diffusion.cpp release master-959-d637cfb
VERSION="0.1.0-beta.3"
ASSUME_YES=0
IMAGES=ask
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --no-images) IMAGES=no ;;
    --images) IMAGES=yes ;;
    *) echo "Unknown option: $arg"; exit 2 ;;
  esac
done

exec > >(tee -a "$LOG") 2>&1
echo
echo "=== Origami Reader $VERSION Linux install, $(date) ==="
echo "Kit: $KIT"

say()  { printf '\n\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarning:\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mStopped:\033[0m %s\nThe full log is in %s\n' "$*" "$LOG"; exit 1; }
trap 'fail "an unexpected error on line $LINENO (see the log above)."' ERR
ask() {
  # ask "question" -> 0 for yes
  if [ "$ASSUME_YES" = 1 ]; then return 0; fi
  local answer
  if { : </dev/tty; } 2>/dev/null; then read -r -p "$1 [Y/n] " answer </dev/tty || answer=n; else read -r -p "$1 [Y/n] " answer || answer=n; fi
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

# --- 0. License -------------------------------------------------------------
say "Origami Reader license"
echo "Origami Reader is made by Sov3ryn. It is free to use at home, school or work;"
echo "copies may not be shared, sold or modified. Full terms: $KIT/LICENSE.txt"
if [ "$ASSUME_YES" != 1 ]; then
  if { : </dev/tty; } 2>/dev/null; then read -r -p "Do you agree to the Origami Reader license? [y/N] " agreed </dev/tty || agreed=n
  else read -r -p "Do you agree to the Origami Reader license? [y/N] " agreed || agreed=n; fi
  [[ "$agreed" =~ ^[Yy] ]] || fail "The license was not accepted, so nothing was installed."
fi

# --- 1. This computer -------------------------------------------------------
say "Checking this computer"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|aarch64) ;;
  *) fail "Origami Reader needs a 64-bit x86 or ARM computer (found $ARCH)." ;;
esac
. /etc/os-release 2>/dev/null || true
echo "System: ${PRETTY_NAME:-unknown} ($ARCH)"
FREE_KB=$(df -Pk "$HOME" | awk 'NR==2 {print $4}')
if [ "${FREE_KB:-0}" -lt $((14 * 1024 * 1024)) ]; then
  fail "About 14 GB of free space is needed in your home folder (building, Python packages and models)."
fi
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  GPU=nvidia
  echo "Graphics: NVIDIA ($(nvidia-smi --query-gpu=name --format=csv,noheader | head -1))"
elif grep -qs 0x1002 /sys/class/drm/card*/device/vendor; then
  GPU=amd
  echo "Graphics: AMD (speech will try the ROCm build of PyTorch; artwork uses Vulkan)"
else
  GPU=none
  echo "Graphics: no NVIDIA or AMD card found; speech will run on the processor (slower)."
fi

# --- 2. System packages -----------------------------------------------------
say "System packages for building the app"
if command -v apt-get >/dev/null 2>&1; then
  PKGS=(libwebkit2gtk-4.1-dev build-essential curl wget file xz-utils libxdo-dev libssl-dev
        libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config git cmake
        python3 python3-venv python3-pip)
  OPTIONAL=(libvulkan-dev glslc spirv-headers glslang-tools)
  INSTALL=(sudo apt-get install -y)
  REFRESH=(sudo apt-get update)
elif command -v dnf >/dev/null 2>&1; then
  PKGS=(webkit2gtk4.1-devel openssl-devel curl wget file xz libxdo-devel libappindicator-gtk3-devel
        librsvg2-devel gcc gcc-c++ make patchelf pkgconf-pkg-config git cmake
        python3 python3-pip)
  OPTIONAL=(vulkan-headers vulkan-loader-devel glslc spirv-headers-devel glslang)
  INSTALL=(sudo dnf install -y)
  REFRESH=(true)
elif command -v pacman >/dev/null 2>&1; then
  PKGS=(webkit2gtk-4.1 base-devel curl wget file xz openssl xdotool libappindicator-gtk3 librsvg
        patchelf pkgconf git cmake python python-pip)
  OPTIONAL=(vulkan-headers vulkan-icd-loader shaderc spirv-headers glslang)
  INSTALL=(sudo pacman -S --needed --noconfirm)
  REFRESH=(true)
elif command -v zypper >/dev/null 2>&1; then
  PKGS=(webkit2gtk3-soup2-devel libopenssl-devel curl wget file xz libxdo-devel libappindicator3-1
        librsvg-devel gcc gcc-c++ make patchelf pkg-config git cmake python3 python3-pip)
  OPTIONAL=(vulkan-devel shaderc)
  INSTALL=(sudo zypper install -y)
  REFRESH=(true)
else
  PKGS=()
  OPTIONAL=()
  warn "Unknown package manager. Install the Tauri prerequisites for your distribution"
  warn "(https://v2.tauri.app/start/prerequisites/), Python 3.10 to 3.13, git and cmake, then run this again."
fi
if [ ${#PKGS[@]} -gt 0 ]; then
  echo "Needed: ${PKGS[*]}"
  echo "Optional, for faster artwork on the graphics card: ${OPTIONAL[*]}"
  if ask "Install or update these with sudo now?"; then
    "${REFRESH[@]}"
    "${INSTALL[@]}" "${PKGS[@]}" || warn "Some packages could not be installed; the build will tell if one is missing."
    # Not every release has these (older Ubuntu has no glslc); artwork then
    # runs on the processor.
    for pkg in "${OPTIONAL[@]}"; do "${INSTALL[@]}" "$pkg" >/dev/null 2>&1 || echo "Optional package not available: $pkg"; done
  else
    warn "Skipped. The build may fail if a package is missing."
  fi
fi

# --- 3. Rust and Node -------------------------------------------------------
say "Build tools"
export PATH="$HOME/.cargo/bin:$TOOLS/node/bin:$PATH"
if ! command -v cargo >/dev/null 2>&1; then
  if ask "Rust is not installed. Install it for this user with rustup (rust-lang.org)?"; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    export PATH="$HOME/.cargo/bin:$PATH"
  else
    fail "Rust is needed to build the app."
  fi
fi
echo "Rust: $(cargo --version)"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 24 ]; then
  if ask "Node.js 24 is needed (found ${NODE_MAJOR:-none}). Download the official build into $TOOLS (nothing system-wide)?"; then
    case "$ARCH" in x86_64) NARCH=x64 ;; aarch64) NARCH=arm64 ;; esac
    mkdir -p "$TOOLS"
    BASE="https://nodejs.org/dist/latest-v24.x"
    FILE=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk "/linux-$NARCH\\.tar\\.xz\$/ {print \$2}")
    SUM=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk "/linux-$NARCH\\.tar\\.xz\$/ {print \$1}")
    curl -fL "$BASE/$FILE" -o "$TOOLS/$FILE"
    echo "$SUM  $TOOLS/$FILE" | sha256sum -c -
    rm -rf "$TOOLS/node"
    mkdir -p "$TOOLS/node"
    tar -xJf "$TOOLS/$FILE" -C "$TOOLS/node" --strip-components=1
    rm -f "$TOOLS/$FILE"
  else
    fail "Node.js 24 or newer is needed to build the app."
  fi
fi
echo "Node: $(node -v)"

# --- 4. Build the reader ----------------------------------------------------
say "Building Origami Reader (this takes a few minutes the first time)"
cd "$KIT/source"
npm ci --no-audit --no-fund
npx tauri build --no-bundle
BINARY="$KIT/source/src-tauri/target/release/origami-reader"
[ -x "$BINARY" ] || fail "The build did not produce the app."

# --- 5. Install the program and voices --------------------------------------
say "Installing to $PREFIX"
if [ -d "$PREFIX" ]; then
  if ask "An earlier Origami Reader install exists there. Replace it (your library is kept)?"; then
    rm -rf "$PREFIX"
  else
    fail "Kept the existing install."
  fi
fi
mkdir -p "$PREFIX/models" "$PREFIX/voices"
install -m 755 "$BINARY" "$PREFIX/origami-reader"
cp -r "$KIT/source/workers" "$PREFIX/workers"
cp "$KIT/source/src-tauri/icons/128x128@2x.png" "$PREFIX/icon.png"
cp -r "$KIT/payload/voices/." "$PREFIX/voices/"
cp "$KIT/payload/voice-catalog.json" "$PREFIX/voice-catalog.json"
cp -r "$KIT/payload/models/Qwen3-TTS-12Hz-0.6B-Base" "$PREFIX/models/"
cp -r "$KIT/payload/licenses" "$PREFIX/licenses"

# --- 6. Speech runtime ------------------------------------------------------
say "Speech runtime (Python packages, downloaded once)"
PY=""
for candidate in python3.12 python3.13 python3.11 python3.10 python3 python3.14; do
  if command -v "$candidate" >/dev/null 2>&1; then
    V=$("$candidate" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
    case "$V" in 3.10|3.11|3.12|3.13|3.14) PY="$candidate"; break ;; esac
  fi
done
[ -n "$PY" ] || fail "Python 3.10 to 3.13 is needed for speech (found $(python3 -V 2>&1)). Install python3.12 and run this again."
echo "Python: $($PY -V)"
"$PY" -m venv "$PREFIX/python"
VPY="$PREFIX/python/bin/python3"
"$VPY" -m pip install --upgrade pip
# torch and torchaudio must come together at matching versions; a newer
# torchaudio is built for a different CUDA and fails to load.
TORCH_DONE=0
if [ "$GPU" = nvidia ]; then
  "$VPY" -m pip install "torch==2.10.0" "torchaudio==2.10.0"
  TORCH_DONE=1
elif [ "$GPU" = amd ]; then
  # AMD: PyTorch's ROCm builds (a large download). The newest ROCm index that
  # has this torch version is used; if none fits, speech uses the processor.
  for ROCM in rocm7.1 rocm7.0; do
    if "$VPY" -m pip install "torch==2.10.0" "torchaudio==2.10.0" \
        --index-url "https://download.pytorch.org/whl/$ROCM"; then
      TORCH_DONE=1; echo "Installed PyTorch for $ROCM"; break
    fi
  done
  if [ "$TORCH_DONE" = 1 ] && ! "$VPY" -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)"; then
    warn "PyTorch cannot use this AMD card yet, so speech will run on the processor."
    [ -e /dev/kfd ] || warn "/dev/kfd is missing: the amdgpu kernel driver with ROCm support is needed."
    id -nG | grep -qw render || warn "Add yourself to the render and video groups (sudo usermod -aG render,video \$USER), log out and in, then run this installer again."
    warn "ROCm supports most Radeon RX 6000 and newer cards; older cards stay on the processor."
  fi
fi
if [ "$TORCH_DONE" = 0 ]; then
  "$VPY" -m pip install "torch==2.10.0" "torchaudio==2.10.0" --index-url https://download.pytorch.org/whl/cpu
fi
mkdir -p "$TOOLS"
grep -v -E '^(torch|torchaudio)==' "$KIT/source/installer/runtime-requirements.txt" | grep -v '^#' > "$TOOLS/requirements.txt"
"$VPY" -m pip install -r "$TOOLS/requirements.txt"
"$VPY" -c "import torch, torchaudio, transformers, soundfile; print('Speech runtime ready, torch', torch.__version__, ('AMD GPU (ROCm)' if torch.version.hip else 'NVIDIA GPU (CUDA)') if torch.cuda.is_available() else 'processor')"

# --- 7. Cover and portrait artwork (optional) -------------------------------
IMAGE_EXE=""
IMAGE_BACKEND="cpu"
if [ "$IMAGES" = ask ]; then
  if [ -f "$KIT/payload/models/dreamshaper-8-lcm.safetensors" ] && \
     ask "Set up local cover and portrait artwork (builds stable-diffusion.cpp, about 10 minutes, uses DreamShaper 8 LCM under the CreativeML OpenRAIL-M license in licenses/)?"; then
    IMAGES=yes
  else
    IMAGES=no
  fi
fi
if [ "$IMAGES" = yes ]; then
  say "Building the image runtime (stable-diffusion.cpp $SD_REVISION)"
  SD="$TOOLS/stable-diffusion.cpp"
  rm -rf "$SD"
  git clone --recursive https://github.com/leejet/stable-diffusion.cpp "$SD"
  git -C "$SD" checkout "$SD_REVISION"
  git -C "$SD" submodule update --init --recursive
  VULKAN=OFF
  if command -v glslc >/dev/null 2>&1 && pkg-config --exists vulkan 2>/dev/null; then VULKAN=ON; fi
  build_sd() {
    rm -rf "$SD/build"
    cmake -S "$SD" -B "$SD/build" -DCMAKE_BUILD_TYPE=Release -DSD_VULKAN="$1" && \
      cmake --build "$SD/build" --config Release -j "$(nproc)"
  }
  # The graphics card build needs Vulkan development files; without them the
  # processor build still works, only slower.
  BUILT=0
  if build_sd "$VULKAN"; then
    BUILT=1
  elif [ "$VULKAN" = ON ]; then
    warn "The graphics card build of the image runtime failed; building for the processor instead."
    VULKAN=OFF
    build_sd OFF && BUILT=1
  fi
  if [ "$BUILT" = 1 ]; then
    SD_BIN=$(find "$SD/build" -type f \( -name 'sd-cli' -o -name 'sd' \) -perm -u+x | head -1)
    if [ -n "$SD_BIN" ]; then
      mkdir -p "$PREFIX/image-runtime"
      install -m 755 "$SD_BIN" "$PREFIX/image-runtime/sd-cli"
      find "$SD/build" -name '*.so*' -exec cp -P {} "$PREFIX/image-runtime/" \; 2>/dev/null || true
      cp "$KIT/payload/models/dreamshaper-8-lcm.safetensors" "$PREFIX/models/"
      IMAGE_EXE="$PREFIX/image-runtime/sd-cli"
      [ "$VULKAN" = ON ] && IMAGE_BACKEND="vulkan0"
      echo "Image runtime ready ($IMAGE_BACKEND)."
    else
      warn "The image runtime built but its program was not found; artwork stays off."
    fi
  else
    warn "The image runtime could not be built; artwork stays off. Reading and speech are unaffected."
  fi
fi

# --- 8. Settings, menu entry and uninstaller --------------------------------
say "Finishing"
OPTIONS=$(printf '{"prefix":"%s","configDir":"%s","version":"%s","imageExecutable":"%s","imageBackend":"%s"}' \
  "$PREFIX" "$CONFIG_DIR" "$VERSION" "$IMAGE_EXE" "$IMAGE_BACKEND")
"$VPY" "$KIT/linux_setup.py" "$OPTIONS"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" || true

trap - ERR
say "Origami Reader is installed"
echo "Open it from your applications menu, or run: $PREFIX/origami-reader"
echo "Remove it with: $PREFIX/uninstall-origami.sh   (add --remove-library to delete your books too)"
echo "Log: $LOG"
