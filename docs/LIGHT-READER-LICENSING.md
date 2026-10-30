# Light reader licensing (Kitten and Kokoro)

Origami's own code is under PolyForm Strict 1.0.0 (LICENSE) and the released app under APP-LICENSE.md. Those terms are not compatible with the GPL.

The Kitten and Kokoro readers need `misaki[en]`, which pulls in **phonemizer-fork (GPL-3.0-or-later)** and **espeakng-loader**, which ships the **espeak-ng** library (GPL-3.0-or-later). Kitten imports phonemizer directly. Code that loads them into its own process forms one combined program under the GPL.

So these readers run in `workers/light_tts.py`, a separate program licensed GPL-3.0-or-later (copyright Sov3ryn). The app starts it as its own process (see `src-tauri/src/speech.rs`) and exchanges one JSON message per line over standard input and output. `tts_worker.py` (Qwen, Origami's terms) never imports it or the GPL libraries. Do not import `light_tts.py` from other Origami code, and do not import Origami code into it.

## How the light readers reach users

The kits Origami publishes (the online kit, make-online-windows.py) do not contain phonemizer-fork, espeak-ng, num2words or any other light reader package. Setup installs the pinned versions from PyPI on the user's computer (installer/locks/light.txt). The same holds for the LGPL libraries of the speech runtime, libsoxr (soxr) and libsndfile (soundfile). Only the full kit built by package-windows.py carries them, and it is not published.

seal-package.py refuses to seal a kit that carries any of these packages unless their source is under `source/third-party/<name>/` (espeak-ng, phonemizer-fork, num2words, libsoxr, libsndfile).

## Before shipping the light readers (or the speech runtime) inside a kit

1. Include `workers/light_tts.py`, `workers/LICENSE-GPL-3.0.txt` and `workers/LIGHT-READER-SOURCE.txt` (the workers folder already ships whole).
2. Install the light readers' Python packages in their own environment, separate from the Qwen runtime if practical.
3. Include the **corresponding source** of every GPL and LGPL package the kit carries, for the exact versions shipped, under `source/third-party/<name>/`: phonemizer-fork and espeak-ng (the espeak-ng release built into that espeakng-loader wheel), num2words, libsoxr (check whether the soxr sdist bundles it) and libsndfile with any other LGPL libraries built into the soundfile wheel (check its build; likely mpg123 and LAME). Links alone are not enough for a binary that is distributed. GPL 3 allows a written offer only for physical media, so a download must carry the source or offer it from an equivalent place.
   This is not done yet: plan it with the first offline kit.
4. Keep each package's license file (its `.dist-info` folder) in place.

Kitten and Kokoro model weights are Apache 2.0 and are unaffected.
