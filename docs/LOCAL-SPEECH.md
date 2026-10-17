# Local speech setup

Settings, Models now lists Kitten Mini, Kitten Micro, Kokoro, and Qwen3-TTS Base 0.6B and 1.7B. The manager detects configured local installations, suggests a reader from the detected hardware, and switches engines. Download hosting remains a disabled placeholder. Keep runtimes in dedicated Python environments. The existing Maeve environment may be referenced read-only for local development; never install or upgrade packages into it for Origami.

Kitten and Kokoro use their own presets, not Qwen reference recordings. Switching reader models stops playback, unloads the previous worker, and selects a compatible voice. This initial Kokoro integration exposes the four English presets already tested locally. Voice creation is not part of this update.

Named `models` entries in worker.json use `engine` (`qwen`, `kitten`, or `kokoro`), `path`, and optionally a per-model `python` interpreter. Built-in voice entries set the matching `engine` and `preset`; Qwen entries keep their reference audio and transcript. The two CPU readers use workers/light_tts.py through the existing persistent worker protocol. Configuration and model paths remain local and offline.

The manager can disconnect and reconnect external model files without deleting them. Destructive uninstall is restricted to entries marked `managed: true` whose canonical model directory is directly under Origami's application-data `Models/<known-model-id>` directory. Shared runtimes, voice references, books and exported files are not removed. Generation leases prevent uninstall from removing files while a cancelled job is still releasing them. Future downloads must validate package hashes and licenses before marking an installation ready; there is no network download implementation yet.

1. Prepare a separate compatible faster-qwen3-tts Python environment and model directory. Verify its upstream requirements on the intended platform.
2. Copy workers/worker.example.json to .local/worker.json.
3. Set the absolute interpreter, model and reference WAV paths. Use a voice reference with an accurate transcript and complete speech boundaries.
4. Set unique voice IDs, display names and descriptions. Add `languages` (an array), `gender` (`female`, `male` or `unspecified`), `styles` (an array) and `accent` for the catalog filters. Other or missing gender values are grouped under Unspecified. The separate `language` field controls synthesis in this initial adapter. Label only languages that have been verified for that voice. The adapter uses the configured CUDA device.
5. Run npm run desktop:dev. The launcher reads .local/worker.json automatically.

Alternatively set ORIGAMI_WORKER_CONFIG to an absolute configuration path before launching, or place worker.json in the Tauri application configuration directory for app.origami.reader. A Windows shortcut can target the built executable directly with `--worker-config "absolute-path-to-worker.json" --cover-config "absolute-path-to-cover-engine.json"`. This avoids the console flash from a PowerShell shortcut. Speech worker helpers also use Windows no-console creation flags.

The source repository deliberately excludes .local, audio recordings, credentials and model weights. Configuration paths are interpreted as local paths. The worker uses offline model loading; it does not contact a hosted TTS service.

## Protocol and current limits

The app sends one JSON line with version 1 and a bounded text passage to a persistent child process. The worker returns one WAV result for that passage. A version 1 request with `action: "prepare"` returns `event: "ready"` only after model loading, voice-prompt preparation and CUDA warmup. It does not generate or play a sample. Generation of the next passage overlaps playback of the current one. The UI keeps only a bounded number of audio passages. It does not yet persist generated takes to disk or stream raw model chunks directly to the player.

Settings, Performance includes **Load the voice when Origami opens**, enabled by default (the installer also enables it). It prepares the shared voice, or the last voice used if that one is unavailable. Missing engine configuration skips preloading. Loading runs in the background; an early playback request waits for the same worker rather than launching another one. A preload failure leaves the reader available and allows playback to retry. Choosing a voice while playback is stopped prepares it right away.

One worker serves every voice. The model loads once; each voice only needs its reference prompt, which the worker prepares on first use and keeps for the eight most recent voices. Every request names its voice. Switching voices or books therefore never reloads the model. A worker that receives a voice installed after it started rereads the configuration.

Books share one voice by default. A book can opt in to its own voice from its menu in the Library (the "⋯" button or a right-click) or from Document, Voice in the inspector. While that book is open, the Voice tab chooses its voice; otherwise it chooses the shared voice. Older libraries saved a voice on every book; those choices are kept but unused until the book opts in.

Opening a book, restarting with Read from here, changing voices or stopping playback preserves the loaded model. An epoch file interrupts outstanding generation between CUDA audio chunks; CPU generation checks a stopping criterion. Late results and older queued requests are discarded. Choosing another model version, starting image generation (unless **Keep the voice loaded while artwork is created** is on) and closing the app unload the speech worker. After an artwork job unloads it, the app loads the voice again in the background. Closing sets a shutdown barrier, rejects queued requests, terminates the registered worker and waits for it to exit. On Windows this includes the virtual-environment launcher's Python process tree via the built-in taskkill utility. It does not terminate other TTS apps or unrelated Python processes.

The session cache retains up to 64 passages and approximately 32 MiB of encoded audio strings, keyed by book, voice and exact spoken text. Replays use it immediately; changing voices and permanent book deletion clear relevant entries. Nothing is written to disk. The default Speech setting skips URLs, markup, automation envelopes and decorative emoji in the spoken layer. Disabling it reads literal text. Original document text is preserved.

Voice profiles may set `available: false` with `unavailable_reason` when their language or reference is incompatible with the current engine. These remain in the catalog but cannot be selected or synthesized. Repaired Hindi references are retained this way because Qwen's bundled model does not support Hindi and automatic-language tests produced unreliable output.

## Model versions

A configuration can list several installed models. Settings, Voices and speech shows a version picker when more than one is installed:

```json
{
  "python": "...",
  "model": "C:/Origami/models/Qwen3-TTS-12Hz-0.6B-Base",
  "defaultModel": "qwen3-tts-0.6b",
  "models": {
    "qwen3-tts-0.6b": { "path": "C:/Origami/models/Qwen3-TTS-12Hz-0.6B-Base", "name": "Qwen3-TTS 0.6B", "description": "Balanced quality and speed.", "tier": "standard" },
    "qwen3-tts-1.7b": { "path": "C:/Origami/models/Qwen3-TTS-12Hz-1.7B-Base", "name": "Qwen3-TTS 1.7B", "description": "Most natural. Needs a strong NVIDIA graphics card.", "tier": "high" }
  }
}
```

`model` remains the fallback for older configurations and older app builds. An unknown or removed choice falls back to `defaultModel`, then the first listed model. The installer writes this format and adds the 1.7B entry when that model folder is present. A lighter laptop version (and an installer step that recommends it from the detected hardware) is planned; any Qwen3-TTS Base checkpoint with the same interface can be listed now.

The cover engine accepts the same idea: `cover-engine.json` may include `"models": {"fast": {"name": "SD-Turbo", "profile": "sd-turbo", "model": "..."}}`, and Settings, Cover art offers the installed versions.

## First launch on a new computer

The first time the app opens, it reads the graphics adapters, their memory, total memory and whether the computer is a laptop (Windows display registry and WMI, Linux sysfs and nvidia-smi, macOS sysctl). Nothing is sent anywhere. Only NVIDIA (CUDA) and Apple silicon count toward speech. Desktops with about 12 GB of graphics memory, or any computer with 16 GB, keep automatic covers and portraits on and may keep the voice loaded during artwork. Everything else turns automatic artwork off once, with a notice, so it never competes with reading aloud. Settings, Performance shows the result, can check again and can apply the recommended settings.

CPU inference is not certified. Engine installation, worker timeouts and idle unloading, and persistent audio jobs are subsequent milestones.

## Validation

Measure cold startup separately from warm synthesis. Check intelligibility, accent consistency and joins by listening, not only by text matching. CPU, CUDA, drivers and installed packages must be verified per machine. Never advertise Linux GPU support based only on a successful source build.

A diagnostic failure is shown without including the book's text in an error message. Reference recordings and private runtime paths are not included in CI.

The Windows startup check loaded the configured voice automatically. A repeated prepare request completed in 0.0015 seconds, and a short warm synthesis took 0.87 seconds for 1.92 seconds of audio on the development GPU. These are smoke-test samples, not a throughput benchmark. Closing the window with generation outstanding removed both worker processes and the GPU process entry. Reopening with preloading disabled created no worker. Process and GPU-entry checks are used because Windows WDDM did not report per-process VRAM bytes; no claim about total system GPU memory is inferred while unrelated GPU apps are running.

## Platforms and devices

Set `device` in the worker configuration to `cuda`, `mps`, `cpu` or `auto`. `auto` picks an NVIDIA GPU when available (Windows and Linux), the Apple silicon GPU through Metal on macOS, and otherwise the CPU. The fast streaming path uses faster-qwen3-tts and requires CUDA; Metal and CPU use the standard qwen_tts model in float16 (Metal) or float32 (CPU).

| System | `python` example | Usual `device` |
| --- | --- | --- |
| Windows | `C:/path/to/venv/Scripts/python.exe` | `cuda` or `cpu` |
| Linux | `/path/to/venv/bin/python3` | `cuda` or `cpu` |
| macOS | `/path/to/venv/bin/python3` | `mps` on Apple silicon, `cpu` on Intel |

Playback on Linux uses WebKitGTK, which needs GStreamer's good plugins for WAV audio (`gstreamer1.0-plugins-good` on Debian and Ubuntu, `gstreamer1-plugins-good` on Fedora). The packaged deb and rpm declare this dependency. Metal and Linux GPU synthesis have not been validated on a development machine yet.

## Runaway speech protection

Autoregressive voice models decide for themselves when a phrase ends. Very short inputs such as a lone "1" can miss that decision and produce noise until the token limit, which was 56 seconds with the previous flat limit of 700 tokens at 12.5 frames per second.

- Every request has a token budget based on its text: about 2.5 seconds plus one second per six characters, never above 700 tokens. A lone number is capped near 3.4 seconds.
- The app never sends a bare number or single word on its own. Heading numbers are spelled out ("One.") and joined to the following sentence; short sentences such as "Oh!" or "No." are joined to a neighbour.
- If audio reaches the budget, the worker discards it and retries once at a calmer temperature (`retry_temperature`, default 0.6). If that also overruns, it returns brief silence flagged as unvoiced. Playback continues and the reader shows a "not read" marker in the margin that retries from that passage.
- Voice variation in Settings, the Voices page and the Voice tab sets the model temperature per request (0.5 to 1.1, default 0.9). Lower is steadier, higher is more expressive and more likely to stumble. The optional `temperature` and `frame_rate` worker settings change the defaults.


## Voice designer

The Voices workspace has My voices and Create a voice tabs. Creation uses the separate Qwen3-TTS 12Hz 1.7B VoiceDesign model, not a Base reader checkpoint. The model supports English, Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Italian and Russian. Voice category, accent and style labels organize the catalog; the editable description controls vocal character.

Configure `voice-design.json` beside `worker.json`, or set `ORIGAMI_VOICE_DESIGN_CONFIG`. Without an override, the app checks its configuration directory. Paths below are illustrative, not included model files:

```json
{
  "defaultModel": "qwen-voice-design",
  "models": {
    "qwen-voice-design": {
      "model": "/absolute/path/to/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
      "python": "/absolute/path/to/venv/bin/python3",
      "device": "auto",
      "managed": false
    }
  }
}
```

The Python environment needs `qwen_tts`, compatible PyTorch, NumPy and soundfile. On Windows point `python` at the environment's `Scripts/python.exe`. The creator appears in Settings, Models and respects disconnect/reconnect and guarded app-owned uninstall. Download hosting remains a disabled placeholder.

Each batch loads the creator once, generates one to three takes with successive seeds, and exits to release model memory. Reader and artwork jobs are stopped first and cannot run concurrently with the batch. Cancel, leaving the Voices page, changing model installation or closing the app terminates creation; completed takes remain available. CPU, CUDA and Metal device selection is implemented, but only Windows NVIDIA execution has been tested here.

Draft takes and their design, seed, waveform, favorite and notes live in the application data folder under `VoiceStudio/drafts`. At most 60 takes are retained; the user deletes unwanted previews before adding more. Samples are limited to 600 characters, audio to 75 seconds, and a batch to 15 minutes. The form draft is saved locally. Review audio, correct its reference transcript and confirm it before saving.

Saved profiles and independent WAV copies live in `CreatedVoices`. The catalog and persistent reader worker merge these without modifying bundled voice manifests. Profiles work with Qwen Base readers; Kitten and Kokoro have incompatible built-in voice formats. Deleting a preview never removes its saved profile, reference recording or a manually exported WAV. The existing portrait-generation preferences apply to saved voices. This is voice design from text; recording import, multi-character casting and the larger production studio remain separate work.
