# Gemini provider addition

The provider abstraction remains schema-only: `provider.analyze` obtains a
validated JSON layout, then `merge_with_cv.merge` combines only confident,
non-duplicate macro regions with local CV/OCR evidence. Code generation never
receives raw Gemini text or evaluates provider code.

For `VISION_PROVIDER=gemini`, key precedence is `VISION_API_KEY`, then
`GEMINI_API_KEY`; `OPENAI_API_KEY` is deliberately ignored. The adapter uses
Google's documented `v1beta/models/<model>:generateContent` REST endpoint,
`x-goog-api-key` header, inline image data only in the HTTPS body, and
`responseMimeType=application/json`. Normal jobs and status reads do not make
smoke calls. All provider failure modes fall back to local CV/OCR.
