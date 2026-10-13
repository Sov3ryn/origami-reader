# Local voice portraits

The optional [cover runtime](COVER-GENERATION.md) also generates small fictional character portraits. The improved profile uses a separate DreamShaper 8 LCM checkpoint by Lykon, about 2.1 GB. It runs through the same stable-diffusion.cpp runtime. Images are generated locally, without a hosted service.

Portraits render at the model's 512 × 512 working size, then are downsampled to 256 × 256 WebP and displayed at 56 pixels. Direct 256 rendering introduced face and texture artifacts. DreamShaper uses the LCM sampler/scheduler, six steps, guidance 2 and a 3 GiB managed GPU-memory budget. Standard negative guidance discourages lettering and unwanted content. Covers now share DreamShaper, with a separate vertical layout and saved 320 × 448 output. Portraits inherit the common image model unless a portrait override is configured. Legacy SD-Turbo portraits remain supported at 512 × 512, two steps and guidance 1. There is no upscale pass.

The portrait prompt requests painted head-and-shoulders art of a fully clothed adult. Known local IDs have individual character descriptions. New IDs receive a stable fictional description from selected gender, style and ID, unless a voice profile supplies `portraitAppearance`. That field can describe ethnicity, age, hair, clothing and expression, for example `adult Japanese man, dark hair, charcoal wool jacket, warm expression`. The editor can revise the full description. Language and accent do not determine ethnicity. Reference recordings, transcripts and free-form speech descriptions are not sent to the image model. This art does not identify the speaker or infer their appearance from audio. The catalog and language filters have no 20-language limit; synthesis support still depends on the installed speech engine and verified profiles.

**Generate missing voice portraits automatically** is on by default in Settings. Generation begins when the Voices catalog or Reader voice tab is open, playback is stopped, and the window is visible. It fills missing portraits for the installed catalog, even when the visible filters hide some voices. Covers and portraits share one queue and one native image-process slot. Speech has priority: starting playback cancels the image job and loads speech normally. The image model is unloaded after each image. Failed or cancelled automatic attempts are not repeatedly retried in a loop; **Refresh voices** retries missing portraits. Switching off automation cancels an active portrait job and clears pending automatic portrait requests.

Hover or keyboard-focus an avatar and use **Change portrait**. You can edit its description, regenerate with a new random seed, cancel generation, or choose PNG, JPEG or WebP art. Uploaded images pass through the same raster-only decoding and pixel budget as covers, and are cropped to a small square. Existing generated and uploaded images are never automatically replaced. The editor traps keyboard focus and restores it when closed. Portraits always use standard guidance, independently of the mature-cover preference. Prompt guidance does not guarantee that a generative image has no unwanted content or lettering.

Portrait art, accepted descriptions and origin are stored in Origami's SQLite `voice_portraits` table, keyed by voice ID. Refreshing, importing/configuring additional profiles and restarting preserve existing art. The importer is currently the local worker configuration described in LOCAL-SPEECH.md; a portable in-app voice-pack importer is still planned. Window focus and a visible-window 15-second catalog refresh detect configuration changes; a manual refresh is also available. Never write portraits, recordings or paths into a Maeve installation. Removing a book or its audio does not remove voice art. Browser preview does not generate or install voices.

## Setup and model terms

On Windows, `scripts/install-cover-engine.ps1` installs the runtime and shared DreamShaper model. Existing runtime setups can use `scripts/install-portrait-engine.ps1`; pass `-PortraitsOnly` to retain their existing cover profile. Local development can pass `-Config .local/cover-engine.json`. The script downloads the author's Civitai version 252914, verifies SHA-256 A4F3E1526C5DC4FCBE342F5C410D83AE202C7A415FCEFCBB92E0F93FCD0A87C3, copies the license and records the source. The optional portrait override is:

```json
"portrait": {
  "model": "/absolute/path/to/dreamshaper-8-lcm.safetensors",
  "profile": "dreamshaper-8-lcm"
}
```

The configuration is compatible with a corresponding Linux runtime, which has not been exercised natively. `portrait.backend` can override the common backend, for example `cpu`; otherwise it inherits the cover backend. CPU and Vulkan are supported by the existing runtime. A 3 GiB managed-budget test does not certify a physical 3 or 4 GB card, and excludes unrelated processes and driver allocations. CPU operation worked in the Windows CLI test but was much slower.

[DreamShaper 8 LCM](https://huggingface.co/Lykon/dreamshaper-8-lcm) uses CreativeML OpenRAIL-M, separately from Origami's MPL 2.0 source license. The [author release](https://civitai.com/models/4384?modelVersionId=252914) allows image use and does not permit selling the model itself. Keep model restrictions, licenses and notices when distributing weights. SD-Turbo's terms also remain separate. Model weights and personal generated portraits are excluded from the source repository.

## Local comparison

Three identical appearance descriptions and seed 42 were tested: an East Asian woman, a Black man and a South Asian woman, all fully clothed. SD-Turbo at 256 took 2.54 to 2.74 seconds and malformed one face; 512 took 3.20 to 3.28 seconds and improved detail but retained flat illustrated faces. DreamShaper at 512 took 8.51 to 8.89 seconds, with cleaner faces and more consistent styling in these samples. These are Windows RTX 4080 SUPER tests with a 3 GiB managed budget, not broad throughput or fairness benchmarks. A CPU-only portrait completed in 79.72 seconds with eight threads on a Ryzen 9 7950X3D. Lower-end CPU speed is unverified. The final 11-voice native batch completed in 101.84 seconds, stored 256-pixel WebP images and retained them after reload. Every image process exited after its job.
