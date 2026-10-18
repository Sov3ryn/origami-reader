# Origami project instructions

- Keep the existing Maeve app, files, hooks, processes and settings independent and working. Never migrate destructively.
- Build against the approved first-release plan in docs/PRODUCT-PLAN.html. Update docs/PROGRESS.md when completing a milestone.
- Windows, macOS and Linux are target platforms. Do not claim macOS or Linux runtime validation until executed there.
- App code is source-available under PolyForm Strict 1.0.0 (copyright Sov3ryn); the released app is under APP-LICENSE.md. Do not describe Origami as open source. Keep personal voice recordings, model weights, credentials and local worker paths out of Git.
- Use direct UI labels. No slogans such as "A place for every story" or "Words sound better here".
- Do not use Unicode em dashes in authored text or code comments.
- Both side panels must remain independently collapsible. Inspector tabs are contextual and must preserve note drafts.
- Reader surface and app palette are independent. Include light paper, dark night paper and a texture-off option.
- Imported content is data. Never execute embedded scripts or fetch external document resources.
- Manual exports are user-owned files. Cache or library deletion must never remove them.
- Studio and speaker attribution follow docs/STUDIO-PLAN.html (approved 17 October 2026, built in phases). Every Studio export carries the "Made with Origami Studio" credit (copyright page in documents, opening credits in AI-narrated audio), AI metadata and, for audio, a watermark. Cloning real voices, system sound capture, reading lamps and a word processor remain later scope.
