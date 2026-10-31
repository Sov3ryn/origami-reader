# Local voice casting and quality control

This development tool generates original synthetic English reference voices, tests them through Origami's real Qwen worker, and produces a listening gallery. It does not modify app settings, install voices, upload audio, call paid services, or fine-tune model weights.

## Requirements

- A local Qwen3-TTS 1.7B VoiceDesign checkpoint and the reader's 1.7B and 0.6B Base checkpoints.
- The same generation Python environment used by Origami's worker: PyTorch, qwen_tts, faster_qwen3_tts and soundfile. The current runner uses CUDA. It has been exercised on an RTX 4080 SUPER, not validated across GPUs.
- A local evaluation environment with faster-whisper, the cached small.en model, onnxruntime, numpy, scipy, librosa, soxr and soundfile. Evaluation uses CPU to leave GPU memory for generation.
- Microsoft's DNSMOS P.835 `sig_bak_ovr.onnx`, its license and a `sources.json` file containing the download URL and checksum. The evaluation model stays outside the repository and the app package.

Copy `config.example.json` outside Git and replace the example paths. `worker_config` is read for the installed model paths. It is never edited. The optional baseline package is the earlier approved English CreatedVoices folder. Omit `baseline_pack` for a new project without those profiles.

Run from the repository with the generation Python executable:

```powershell
python scripts/voice-quality/pipeline.py C:/VoiceCasting/config.json
```

Use `--skip-design` only when all reference candidates have already been generated. Re-running resumes completed files. A changed casting plan, seed or take count requires a new output directory. Keep a single pipeline process per output directory. GPU stages run sequentially. Stop the parent pipeline and its own worker if aborting; do not stop unrelated Origami or Maeve processes.

## What runs

1. Generate four references for each of ten roles from `cast.json`. Preserve float WAV originals, prompts, seeds, generation parameters and hashes. Do not denoise, pitch-shift or stretch the voices.
2. Check the reference transcript using Whisper small.en. Check clipping, DC offset, pacing, long silence and edge conditions. Estimate DNSMOS P.835 quality and advisory pitch statistics.
3. Record Qwen speaker embeddings for the audit, then use the independently trained, locally cached Chatterbox voice encoder for identity comparison when configured. Prefer accurate, clean candidates while penalizing highly similar identities across roles. The optimization considers all roles together rather than always favoring the first one.
4. Read the same unfamiliar probe with every passing reference candidate per role using the actual Origami 1.7B worker. Retry technical failures once, then select a passing finalist.
5. Read four held-out passages per finalist through both Base readers, with up to two retries for failed outputs. Failed attempts remain available with their QC records.
6. Optionally read the same probe with the previous approved voices. Compare matching passages, not unrelated recordings.
7. Run one additional probe per voice on both readers at the app's configured default temperature, or the worker's 0.9 default. The four main holdouts use 0.8.
8. Measure reference-to-reader identity similarity and flag reader clips closer to another candidate's reference. Produce the gallery, reports, review-only compatible voice profiles and decision export.

The worker is launched with a separate configuration and with `ORIGAMI_CREATED_VOICES` unset. This isolates the audition from the installed voice library. Profiles retain the reference transcript and use full reference conditioning rather than speaker embeddings alone.

## Technical gates

- Word error rate at most 4.5%, with exact first and last two normalized words. Ordinary numerals and clock notation are expanded so ASR formatting such as 17 versus seventeen is not treated as a speech error.
- Clipping fraction at most 0.01%, absolute DC offset at most 0.02.
- Expected script pacing between 75 and 245 words per minute.
- Internal low-amplitude interval at most 2.4 seconds.
- Empty or nonfinite audio is rejected.

Edge silence, possible abrupt endings, low predicted quality and speaker similarity produce review information. DNSMOS is a weak ranking factor, not proof of beautiful narration. Pitch is never used as a gender or age classifier. Thresholds are explicit development defaults, not universal speech standards. ASR errors can also be recognizer mistakes, so failed scripts retain transcripts and word timestamps.

`test_gates.py` exercises missing endings, repetition, clipping, silence and punctuation normalization. The main integration test is the actual generated audio passing through the real worker and independent local recognizer.

## What still requires ears

Age, gender presentation, accent fidelity, grain, warmth, expressive timing, breath quality, distinctiveness and long listening comfort need human review. The page records Keep, Alternate, Redo and notes and exports decisions as JSON. These candidates are never marked shipping-approved automatically. A compatible review pack is not an installation instruction.

The four holdouts cover roughly a minute of speech per voice and reader, not an entire audiobook. Repeat longer chapters and difficult text before a release. A technically clean sample does not guarantee every future sentence. The reader protocol does not expose a seed, so reader tests are stochastic. Reference seeds and model fingerprints improve reproducibility without promising bit-exact results.

Listening copies receive a fixed gain toward -21 dBFS RMS, limited to a 0.9 peak and a maximum gain of two. This is not LUFS normalization. Original files and gain records remain available. Reports distinguish all generated candidates from the selected ten and disclose selection bias in comparisons against the old package.

## Sources

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), official Voice Design then Clone workflow. Checkpoint-specific licenses remain with the local models.
- [Microsoft DNSMOS](https://github.com/microsoft/DNS-Challenge/tree/master/DNSMOS), P.835 inference and non-personalized polynomial calibration. [DNS Challenge license](https://github.com/microsoft/DNS-Challenge/blob/master/LICENSE), CC BY 4.0. This implementation samples 9.01-second windows every three seconds, rather than the reference one-second hop. Attribution and model hashes accompany the run. The predictor measures aspects of speech signal quality, not acting.

All model files, audio and local environment paths belong outside Git. The script and casting prompt files may be versioned.


The optional identity_encoder_source and identity_encoder_weights configuration fields point to the local Chatterbox voice_encoder Python package and ve.safetensors checkpoint. This small model runs on CPU in the evaluation environment and generates no speech. The initial Qwen conditioning embeddings showed cosine scores near one across different identities, so their absolute scores are retained for auditing but not used as the primary distinctiveness measure in this run. Chatterbox source and its MIT notice are at https://github.com/resemble-ai/chatterbox. Source and checkpoint hashes accompany the report.

