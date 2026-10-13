# Local speech setup

The first worker adapter uses faster-qwen3-tts and a locally downloaded Qwen base model. It is a developer setup, not the planned model manager. Keep it in a dedicated Python environment. The existing Maeve environment may be referenced read-only for local development; never install or upgrade packages into it for Origami.

1. Prepare a separate compatible faster-qwen3-tts Python environment and model directory. Verify its upstream requirements on the intended platform.
2. Copy workers/worker.example.json to .local/worker.json.
3. Set the absolute interpreter, model and reference WAV paths. Use a voice reference with an accurate transcript and complete speech boundaries.
4. Set unique voice IDs, display names and descriptions. Add `languages` (an array), `gender` (`female`, `male` or `unspecified`), `styles` (an array) and `accent` for the catalog filters. Other or missing gender values are grouped under Unspecified. The separate `language` field controls synthesis in this initial adapter. Label only languages that have been verified for that voice. The adapter uses the configured CUDA device.
5. Run npm run desktop:dev. The launcher reads .local/worker.json automatically.

Alternatively set ORIGAMI_WORKER_CONFIG to an absolute configuration path before launching, or place worker.json in the Tauri application configuration directory for app.origami.reader. On Windows the local convenience launcher is scripts/open-local.ps1 after building.

The source repository deliberately excludes .local, audio recordings, credentials and model weights. Configuration paths are interpreted as local paths. The worker uses offline model loading; it does not contact a hosted TTS service.

## Protocol and current limits

The app sends one JSON line with version 1 and a bounded text passage to a persistent child process. The worker returns one WAV result for that passage. A version 1 request with `action: "prepare"` returns `event: "ready"` only after model loading, voice-prompt preparation and CUDA warmup. It does not generate or play a sample. Generation of the next passage overlaps playback of the current one. The UI keeps only a bounded number of audio passages. It does not yet persist generated takes to disk or stream raw model chunks directly to the player.

Settings includes **Preload last used voice at startup**, enabled by default. It prepares the last voice that successfully synthesized a playback passage, including a book-specific voice. On first use, or if that voice has been removed, it falls back to the selected installed voice or the first available voice. Missing engine configuration skips preloading. Loading runs in the background; an early playback request waits for the same worker rather than launching another one. A preload failure leaves the reader available and allows playback to retry. Changing the startup switch takes effect on the next launch.

Opening a book, starting playback with an idle worker, or stopping already-buffered audio preserves the loaded model. Stop during an outstanding generation cancels the request and terminates Origami's worker, so the next playback reloads it. Closing the app sets a shutdown barrier, rejects queued requests, terminates the registered worker and waits for it to exit. On Windows this includes the virtual-environment launcher's Python process tree via the built-in taskkill utility. It does not terminate other TTS apps or unrelated Python processes.

The adapter currently does not expose multiple model choices or certify CPU inference. Engine installation, worker timeouts/idle unloading, model selection and persistent audio jobs are subsequent milestones.

## Validation

Measure cold startup separately from warm synthesis. Check intelligibility, accent consistency and joins by listening, not only by text matching. CPU, CUDA, drivers and installed packages must be verified per machine. Never advertise Linux GPU support based only on a successful source build.

A diagnostic failure is shown without including the book's text in an error message. Reference recordings and private runtime paths are not included in CI.

The Windows startup check loaded the configured voice automatically. A repeated prepare request completed in 0.0015 seconds, and a short warm synthesis took 0.87 seconds for 1.92 seconds of audio on the development GPU. These are smoke-test samples, not a throughput benchmark. Closing the window with generation outstanding removed both worker processes and the GPU process entry. Reopening with preloading disabled created no worker. Process and GPU-entry checks are used because Windows WDDM did not report per-process VRAM bytes; no claim about total system GPU memory is inferred while unrelated GPU apps are running.
