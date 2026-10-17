# Platform release status

## Windows x64

The native reader and premium setup shell compile on Windows. The offline kit includes all 43 references, Python 3.12, the installed Qwen runtime and CUDA libraries, Qwen 0.6B weights and tokenizer, and DreamShaper with the Vulkan image runtime. The dependency launcher includes Microsoft's signed WebView2 and Visual C++ installers.

Build prerequisites: Node/npm, Rust MSVC, Microsoft C++ Build Tools, and the private local model/voice assets. Run `npm ci` at the repository root. Set `CARGO_HOME`, `RUSTUP_HOME` and `PATH` appropriately if using an isolated Rust toolchain. Then run `installer/scripts/build-windows.ps1` with `-Output`, `-PythonBase`, `-SitePackages` and `-CargoRegistry`. The output must be a new folder. The packaging script reads the private `.local/worker.json` and `.local/cover-engine.json`; these are not included in the corresponding source archive.

Create a ZIP64 archive of the entire resulting folder. Keep the launcher, setup shell, bootstrap, prerequisites and payload together. `Origami Reader Installer.exe` is the entry point.

The current build is unsigned and has not undergone a clean-machine installation, uninstall or speech test. Compilation and package assembly do not establish runtime compatibility.

## Linux

The Linux beta kit builds the reader on the tester's computer: `installer/scripts/package-linux.py --assets <Windows kit payload/files> --out <new folder> --archive` assembles the source, the 20 English voices, Qwen3-TTS 0.6B, DreamShaper 8 LCM and `installer/linux/` (install-linux.sh, linux_setup.py, START-HERE-LINUX.txt) into a `.tar` that keeps the installer executable.

`install-linux.sh` asks before every sudo or download step, logs to ~/origami-install.log, and:

1. installs the Tauri build prerequisites with apt, dnf, pacman or zypper (Vulkan development files are optional);
2. installs Rust with rustup when missing and, when Node is older than 24, the official Node 24 build into ~/.cache/origami-build-tools (checksum verified, nothing system-wide);
3. builds the reader (`npx tauri build --no-bundle`) and installs it with its workers, voices and model in ~/.local/share/origami-reader;
4. creates a Python 3.10 to 3.13 virtual environment with torch and torchaudio 2.10.0 together (CUDA wheels when nvidia-smi works, CPU wheels otherwise) and the pinned runtime requirements;
5. optionally builds stable-diffusion.cpp master-959-d637cfb with Vulkan, falling back to a processor build;
6. writes ~/.config/app.origami.reader/worker.json and cover-engine.json, an applications-menu entry and an uninstall script that keeps the library unless asked.

Tested on 15 October 2026 in Ubuntu 24.04 under WSL2 (x86_64, RTX 4080 SUPER): a fresh install from the packaged tar, the uninstaller, speech on CUDA (4.6 s of audio for a test sentence), a cover rendered by the image runtime on the processor (about 70 s on 32 cores; WSL2 exposes no Vulkan device), and the reader's library, Aa menu and book mode in an Xvfb display. Findings fixed during the test: torchaudio must be pinned with torch; the Vulkan build needs SPIR-V headers and now falls back to the processor; the app retries artwork on the processor when a graphics backend fails and allows 15 minutes for processor renders; book mode hides the turned-away page face itself because software rendering ignores CSS backface hiding; the app disables WebKitGTK's DMA-BUF renderer on NVIDIA systems, a common cause of blank windows.

Not yet tested: other distributions, Wayland desktops on real hardware, AMD and Intel graphics, ARM computers. No AppImage or .deb is distributed; the build-on-device kit avoids glibc and driver mismatches for this beta.

## macOS

No macOS binary or compatibility claim is provided. Build on an actual Mac with Xcode command-line tools, Node and Rust. Create separate Apple Silicon and Intel artifacts, or a universal app after validating both runtime architectures. Use `node node_modules/@tauri-apps/cli/tauri.js build --bundles app,dmg` for the reader. A macOS icon, native Python dependencies, image runtime and bundled resource paths must be completed before distribution.

The standard Qwen CPU branch avoids requiring CUDA, but neither CPU speech nor image generation has been run on macOS. Metal acceleration is not implemented by this installer. The native setup shell needs macOS `.app` resource-root handling and platform-specific startup/uninstall integration before packaging. Signing and notarization require the app owner's Apple Developer credentials. Do not ask recipients to disable Gatekeeper.

## Before calling a platform ready

Run an explicitly requested clean-machine installation and uninstall check, launch the reader, generate a short passage for the supported packs, inspect cover and portrait generation, and confirm cancellation, missing/corrupt payload and insufficient-space behavior. Preserve user libraries during reinstall/uninstall. Record exact OS, architecture, graphics hardware, drivers and outcomes. The current milestone intentionally reports the unperformed runtime checks as pending.
