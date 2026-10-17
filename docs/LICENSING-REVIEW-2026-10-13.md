# Licensing review for a public pay-what-you-want release

> **Superseded on 16 October 2026:** Origami's own license changed from MPL 2.0 to PolyForm Strict 1.0.0 for the source and APP-LICENSE.md for the app. MPL-specific points below no longer apply; third-party findings still do.

Researched 13 October 2026 against the official license pages linked below. **This is not legal advice.** It is a non-lawyer's reading meant to show where the real risks are. A short consultation with a Quebec lawyer is worth it before a public release, mainly for the voice recordings.

Release model assumed: free download (price can be zero), optional donations, MPL 2.0 app code, offline installer that bundles models and voices.

## Summary

| Component | Verdict | What is needed |
| --- | --- | --- |
| App code (MPL 2.0) | OK | Say where the source is (MPL 3.2). Donations and charging are both allowed. |
| Qwen3-TTS 0.6B weights | OK with conditions | Apache 2.0: include the license and any NOTICE, mark modified files. |
| qwen-tts, faster-qwen3-tts | OK with conditions | Apache 2.0 and MIT notices, plus notices for their Python dependencies. |
| DreamShaper 8 LCM | OK with conditions; donations are a grey area | OpenRAIL-M: ship the license, pass the use restrictions on to users. Civitai marks "sell the model" as not allowed: keep the download free and present donations as support for the app. Optional: ask Lykon in writing. |
| stable-diffusion.cpp, ggml | OK with conditions | MIT notices, check its third-party folder. |
| SD-Turbo | Shipped as an optional pack in the private beta 5 kit (17 October 2026) | Free private beta: the kit carries the Stability AI Community License and the required Notice text beside the weights (models/sd-turbo), and "Powered by Stability AI" appears in setup, the model's name in Settings and the kit instructions. The GGUF conversion is stated in the Notice. Before a public or paid release, check the license's registration and revenue terms again. |
| Kitten TTS Mini and Micro, Kokoro-82M | Shipped as an optional pack in beta 5 | Apache 2.0: license and model notice in each model folder. The light reader program that runs them (workers/light_tts.py) is GPL-3 because of phonemizer and espeak-ng; its source and license ship beside it. |
| TrOCR base handwritten, Granite Embedding 97M | Shipped in beta 5 | MIT and Apache 2.0: license files ship in the model folders. |
| **Voice references made with ElevenLabs** | **Risky: do not ship as they are** | See below. |
| Starter books | OK with conditions | CC BY-SA credits for Grayson Bray Morris; check each Standard Ebooks author and translator died in 1971 or earlier (Canadian term). |
| Python, PyTorch, CUDA, cuDNN, Vulkan, VC++, WebView2 | OK with conditions | Ship their notices; only NVIDIA's listed redistributable files; prefer the driver's Vulkan loader and Microsoft's redistributable installers. |
| Flag icons | OK | MIT, license copied to public/flags. |

## The voice recordings

The 43 reference clips were generated with ElevenLabs from voices designed on a paid plan, then used as zero-shot references for the local Qwen model.

- A paid plan gives commercial rights to the generated audio, and ElevenLabs says outputs may be used outside its service.
- However, ElevenLabs' Prohibited Use Policy (updated 9 October 2026, section 12) forbids using its service or output "to develop, train, fine-tune, or improve any AI model or service". It also restricts competing products and passing output on under more permissive terms than your own.
- Zero-shot reference audio is not training. But shipping ElevenLabs output as the built-in voices of another speech product can reasonably be read as "developing an AI service" with it. That has not been tested anywhere, so treat it as a real risk: account termination, a breach claim or a takedown request.
- There is no publicity-rights problem with synthetic designed voices.

Safest options, in order:

1. Record new reference clips with real people who agree in writing: yourself, friends or hired voice actors. The written consent should cover voice cloning, redistribution, worldwide use, duration and what happens if they withdraw. In Quebec the Civil Code (articles 3, 35 and 36) protects a person's voice, and that consent can be withdrawn, so keep the paperwork.
2. Use speech data whose license explicitly allows cloning and redistribution.
3. If you want to keep these clips, ask ElevenLabs support for written permission that names the exact use: output used as reference audio for a local third-party TTS model, redistributed in a free app.

Until one of these is done, keep the ElevenLabs-derived voices for personal use and friends-and-family testing, and do not publish them.

## Before a public release

1. Replace or clear the voice references (above).
2. Keep the download free. Present donations as support for the app, not payment for the models. Avoid itch.io minimum prices.
3. Add a THIRD_PARTY_NOTICES file and a licenses folder covering every bundled component in the table.
4. Put the OpenRAIL-M use restrictions in the app's terms, with a clause that people only clone voices they have consent for.
5. Fill in `SOURCE_URL` and `SUPPORT_URL` in src-tauri/src/lib.rs. The MPL needs the source link; the support button only appears once its link is set.
6. Credit the CC BY-SA book and check the Canadian term for every starter book contributor.
7. Label voices and generated images as AI-generated. Exported audio should carry an "AI-generated" metadata tag (the EU AI Act transparency rules apply from August 2026).
8. Taxes: in Canada donations to a product are usually treated as self-employment income. GST/HST and QST registration starts above CAD 30,000 a year. Ask a Quebec tax professional.

## Sources

- Qwen3-TTS weights: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base
- qwen-tts: https://pypi.org/project/qwen-tts/ ; faster-qwen3-tts: https://github.com/andimarafioti/faster-qwen3-tts
- DreamShaper: https://huggingface.co/Lykon/dreamshaper-8-lcm and https://civitai.com/api/v1/models/4384 ; OpenRAIL-M: https://raw.githubusercontent.com/CompVis/stable-diffusion/main/LICENSE
- SD-Turbo license history: https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md ; https://stability.ai/community-license-agreement
- ElevenLabs: https://elevenlabs.io/use-policy ; https://elevenlabs.io/terms-of-use ; https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
- Quebec Civil Code: https://www.legisquebec.gouv.qc.ca/en/document/cs/CCQ-1991
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en ; Canadian term: https://goodmans.ca/insights/article/canada-extends-basic-term-of-copyright-protection-to-life-of-author-plus-70-years-starting-december-30-2022
- NVIDIA CUDA EULA: https://docs.nvidia.com/cuda/eula/index.html ; WebView2 distribution: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- MPL 2.0 FAQ: https://www.mozilla.org/en-US/MPL/2.0/FAQ/
- GST/HST small supplier: https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html
