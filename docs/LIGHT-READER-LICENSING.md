# Light reader licensing (Kitten and Kokoro)

Origami's own code is under PolyForm Strict 1.0.0 (LICENSE) and the released app under APP-LICENSE.md. Those terms are not compatible with the GPL.

The Kitten and Kokoro readers need `misaki[en]`, which pulls in **phonemizer-fork (GPL-3.0-or-later)** and **espeakng-loader**, which ships the **espeak-ng** library (GPL-3.0-or-later). Kitten imports phonemizer directly. Code that loads them into its own process forms one combined program under the GPL.

So these readers run in `workers/light_tts.py`, a separate program licensed GPL-3.0-or-later (copyright Sov3ryn). The app starts it as its own process (see `src-tauri/src/speech.rs`) and exchanges one JSON message per line over standard input and output. `tts_worker.py` (Qwen, Origami's terms) never imports it or the GPL libraries. Do not import `light_tts.py` from other Origami code, and do not import Origami code into it.

## Before shipping the light readers in a kit

1. Include `workers/light_tts.py`, `workers/LICENSE-GPL-3.0.txt` and `workers/LIGHT-READER-SOURCE.txt` (the workers folder already ships whole).
2. Install the light readers' Python packages in their own environment, separate from the Qwen runtime if practical.
3. Include the **corresponding source** of phonemizer-fork and espeak-ng (the sdists or upstream source archives for the exact versions shipped), or a written offer valid for three years. Links alone are not enough for a binary that is distributed.
4. Keep each package's license file (its `.dist-info` folder) in place.

Kitten and Kokoro model weights are Apache 2.0 and are unaffected.
