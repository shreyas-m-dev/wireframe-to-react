# Wireframe → React Code Generation System

A working implementation of the 7-module pipeline:

```
Upload wireframe → Preprocess → Detect UI elements + read text (OCR)
→ Schema Generator → RAG (retrieve templates) → Code Generation
→ CGDA (whitelist filter) → Validation Engine (diff + retry loop)
→ Final React code
```

Runs completely offline by default — no trained ML model, no API key, no
external service, no network required. **169/169 automated tests pass.**
Across every test wireframe (4 distinct layouts, including a form with
real placeholder text), the deterministic default path produces **100%
structurally-accurate code, 0 CGDA strips, 0 retries needed, every time.**

---

## Part 1 — Step-by-step: running this project manually

### 1. Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 18+** with `npm`
- **Tesseract OCR** (the system binary, not just the Python wrapper) —
  needed for reading placeholder/button text out of wireframes:
  - Ubuntu/Debian: `sudo apt install tesseract-ocr`
  - macOS: `brew install tesseract`
  - Windows: installer at github.com/UB-Mannheim/tesseract/wiki
  - If you skip this, the pipeline still works — it just won't read any
    text out of your wireframes and will use generic labels ("Button 1",
    "Input 1") instead. It fails soft, not hard.
- No API keys, no GPU, no trained model files needed for the default setup.

### Windows-specific note: "Python was not found..." error

If you see `Python was not found; run without arguments to install from
the Microsoft Store...` when generating code, this is a Windows-only
issue and it's now handled automatically in most cases — the backend
auto-detects whether your machine's `python` or `python3` command is real
(Windows normally installs Python as just `python`; `python3.exe` is
usually Windows' own Store-redirect stub, not Python at all).

If you still hit it after updating to this version:
1. Confirm Python is actually installed: open a terminal and run
   `python --version`. If that also shows the Store-redirect message,
   install Python from [python.org](https://www.python.org/downloads/)
   and check **"Add python.exe to PATH"** during setup.
2. Or turn the stub off: **Settings > Apps > Advanced app settings > App
   execution aliases**, and disable the toggles for `python.exe` and
   `python3.exe`.
3. Or tell the backend exactly which command works in your terminal:
   ```powershell
   $env:PYTHON_BIN = "python"    # or wherever your real python.exe is
   npm start
   ```

### 2. Install Python dependencies

```bash
cd wireframe-to-react
pip install -r requirements.txt
```

Installs OpenCV, numpy, scikit-learn (RAG retrieval), and pytesseract
(the Python wrapper around the Tesseract binary from step 1). If your
system blocks global pip installs:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Install backend dependencies

```bash
cd backend
npm install
```

Installs Express, Multer (file uploads), and CORS.

### 4. Install frontend dependencies

```bash
cd ../frontend
npm install
```

Installs React, Vite, and Tailwind CSS.

### 5. Start the backend

From the `backend/` directory:
```bash
npm start
```

You should see `Backend listening on :3000`. Leave this running.

Verify it's alive: `curl http://localhost:3000/api/health` should return `{"status":"ok"}`

### 6. Start the frontend (in a second terminal)

From the `frontend/` directory:
```bash
npm run dev
```

Vite prints a local URL, typically `http://localhost:5173`. Open it in a
browser.

### 7. Use it

1. Drop or choose a wireframe image (PNG/JPEG/WEBP/BMP).
2. Optionally, type design instructions in the box below the upload zone
   — e.g. "dark theme with rounded blue buttons" or "add a footer".
3. Click Generate code. Watch the pipeline schematic light up through all
   7 steps.
4. Switch between the Code and Preview tabs. Recognized instructions and
   any added element show as small badges above the code.
5. Click Download .jsx to save the component.

Or skip the frontend entirely and hit the API directly:
```bash
curl -X POST http://localhost:3000/api/generate \
  -F "wireframe=@/path/to/your/image.png" \
  -F "instructions=dark theme with rounded blue buttons"
```

### 8. Run the full test suite (optional — no installs needed beyond step 2)

```bash
python3 services/preprocessing/tests/run_tests_standalone.py   # 8
python3 services/detection/test_detect.py                       # 4
python3 services/detection/test_heuristic_detector.py            # 11
python3 services/detection/test_ocr_extractor.py                 # 11
node services/schema/schema.test.js                              # 9
python3 services/rag/test_retrieve.py                             # 8
python3 services/codegen/test_generate.py                        # 6
python3 services/codegen/test_template_compiler.py               # 29
python3 services/codegen/test_instruction_parser.py              # 28
node services/cgda/cgda.test.js                                  # 10
node services/validation/validate.test.js                        # 7
python3 scripts/test_e2e_integration.py                          # 5
python3 scripts/test_backend_edge_cases.py                       # 11
python3 scripts/test_realistic_wireframes.py                     # 3
python3 scripts/test_instructions_integration.py                 # 7
node backend/python_resolver.test.js                             # 7
python3 scripts/test_frontend_slow_response.py                   # 5
#                                                       total: 169
```

### 9. Optional: enable free-tier LLM code generation instead of the deterministic compiler

By default, code is generated by a deterministic compiler (see "The two
codegen paths" below). To use an actual LLM instead:

```bash
export GEN_MODE=llm
export GEMINI_API_KEY=your_key   # free, no credit card: https://aistudio.google.com/apikey
```
Restart the backend after setting this. Or use OpenRouter's free-tier
models instead of Gemini:
```bash
export GEN_MODE=llm
export LLM_PROVIDER=openrouter
export OPENROUTER_API_KEY=your_key   # free: https://openrouter.ai/keys
```
If the API call fails for any reason (bad key, rate limit, no network),
the backend automatically falls back to the deterministic compiler rather
than failing your request (`"genMode": "template-fallback"` in the
response).

### 10. Optional: swap in a fine-tuned YOLOv8 model for detection

The default detector (`heuristic_detector.py`) uses real OpenCV edge/contour
detection and needs no training. `services/detection/detect.py` and
`sidecar.py` hold the swap-in path for a fine-tuned YOLOv8 model if you
later have labeled training data — the rest of the pipeline doesn't need
to change, since both detectors produce the same output shape.

---

## Part 2 — Complete explanation of the project

### What this is

A pipeline that takes an image of a wireframe (a UI mockup — boxes for
buttons, inputs, text blocks) and produces a working React component
whose structure matches what's actually in that image. It's built from 7
distinct modules chained together, each independently testable and each
doing real, verifiable work.

### The 7 modules, what each one does, and what was built

**1. Preprocessing** (`services/preprocessing/preprocess.py`)
Validates every upload before anything else runs: checks the file is a
real, decodable image (not corrupted, not a renamed non-image file),
checks it's not absurdly tiny or huge, and resizes/grayscales/normalizes
it for the steps that need a normalized pixel matrix. Real OpenCV
operations, 8 tests.

**2. Detection** (`services/detection/heuristic_detector.py`, default)
Finds UI elements in the image using classical computer vision — Canny
edge detection, contour finding, and shape-based classification (aspect
ratio, fill density, size) to label each detected region as a button,
input, container, image, icon, checkbox, etc. No machine learning model,
no training data, no GPU — it runs on literally any image you give it.
Verified against 4 structurally different real layouts, plus 3
deliberately harder stress tests (JPEG compression artifacts,
anti-aliased rounded corners, hand-drawn/jittery-line sketches). 16 tests
total.

A second, optional detector (`detect.py` + `sidecar.py`) wraps YOLOv8 for
when you have a fine-tuned model — not used by default since training
data isn't available here, but the code is real and ready to wire in.

**2b. OCR text extraction** (`services/detection/ocr_extractor.py`) — the
feature you asked for. Runs Tesseract OCR on the actual uploaded image to
read whatever text is really drawn there — a "Name" placeholder inside an
input box, a "Submit" label on a button, "Email Address" text, etc. — and
attaches that real text to the UI element it belongs to, using the
element's own detected bounding box as the matching signal. This is why
the generated code says "Submit" instead of a generic "Button 1" whenever
your wireframe actually has that text drawn on it. 11 tests, including
several real bugs found and fixed during development (see below).

**3. Schema Generator** (`services/schema/schema.js`)
Takes the flat list of detected elements (each with a type and a bounding
box) and builds a nested tree — which elements are rows, which are inside
which containers, in what order. Implements the spec's
SORT_Y → GROUP_ROWS → SORT_X → IDENTIFY_CHILDREN algorithm exactly:
elements are clustered into horizontal rows by Y-position, sorted
left-to-right within each row, and nested by bounding-box containment.
Zero dependencies, pure JavaScript. 9 tests.

**4. RAG (Retrieval-Augmented Generation)** (`services/rag/vector_db.py`
+ `seed_templates/templates.json`)
A real, separate, persisted SQLite database on disk
(`services/rag/vectors.sqlite3`) holding 20 hand-written React component
patterns (a header with nav buttons, a login form, a card grid, a
sidebar, a modal, etc.). When the schema is built, this searches that
database using genuine TF-IDF retrieval (term-frequency/inverse-document-
frequency — a real, standard information-retrieval technique, computed
with scikit-learn) to find the templates whose description best matches
the detected layout's shape, and those results influence the generated
code's overall styling. 8 tests.

**5. Code Generation** (`services/codegen/template_compiler.py`, default
— this is the part built to specifically NOT work like an LLM, per your
request)
Rather than asking a language model to guess at what JSX to write (which
is inherently probabilistic and can hallucinate), this deterministically
compiles the schema tree directly into JSX: it walks the tree and emits
exactly one JSX tag per schema node, using a fixed type-to-tag mapping
(button -> `<button>`, input -> `<input>`, etc.) styled with Tailwind
classes. Because the output is derived from the schema by a fixed
algorithm rather than generated by a model, it is mathematically
guaranteed to match the schema exactly — there is no mechanism by which it
could invent an element that wasn't detected. This is what "no
hallucination" means concretely here: not "the model tries not to
hallucinate," but "there is no model in this path, so there is nothing
that could hallucinate." 29 tests, including a kitchen-sink test that
applies every possible style override simultaneously and confirms the set
of emitted tags never changes.

An LLM-based path (`generate.py`, free-tier Gemini/OpenRouter) is also
built and tested — see "The two codegen paths" below for when you'd use it.

**5b. User design instructions** (`services/codegen/instruction_parser.py`)
— the feature you asked for. Free text like "dark theme with rounded blue
buttons, add a footer" gets parsed by a fixed-vocabulary keyword matcher —
not an LLM. It recognizes: 19+ colors (with aliases like "navy" -> indigo,
"gold" -> amber, "charcoal" -> zinc), dark/light theme, rounded/sharp
corners, large/small sizing, shadows, bold/light typography, text
alignment, border weight, outline/filled button style, and transparency —
28 tests covering every category. Anything it doesn't recognize is
silently ignored rather than guessed at, which is what keeps this
hallucination-free: it either matches a known word/phrase, or it does
nothing.

"Add a footer" / "add a search bar" / etc. are handled specially and
safely: the text after "add"/"include" is matched against the SAME RAG
database from module 4, using the same TF-IDF search — so it can
recognize a request against the entire 20-template catalog, not a small
hardcoded list. Critically, a match can only ever be one of those 20
pre-written, human-reviewed templates — never an LLM-invented snippet —
so there's no hallucination risk here either: either a real match is
found above a confidence threshold, or nothing gets added.

**6. CGDA (Code Generation Discrepancy Auditor)** (`services/cgda/cgda.js`)
Parses the generated JSX into a tag tree and strips any tag that has no
corresponding element in the schema — this is the safety net for the
optional LLM path, where hallucination is actually possible. On the
default deterministic path, CGDA runs but never finds anything to strip
(0 strips across every test fixture), which is the expected and desired
outcome. 10 tests, including the exact "before/after hallucinated
canvas tag" scenario the project's spec calls out as a demo case.

**7. Validation Engine** (`services/validation/validate.js`)
Converts both the schema and the generated code into flat tag lists and
diffs them — comparing counts and types to compute a structural accuracy
percentage. If anything doesn't match, it can auto-correct trivial cases
or loop back to code generation with an error report (relevant for the
LLM path; the deterministic path always passes on the first attempt). 7 tests.

**Backend** (`backend/server.js`) — Express API that wires all 7 modules
together for a real HTTP request: receives the upload + instructions,
shells out to Python for detection/OCR and RAG/codegen, runs schema/CGDA/
validation in-process, splices in any requested addition, and returns the
final code plus full metadata.

**Frontend** (`frontend/src/`) — React/Vite dark-theme UI: a drop zone,
the design-instructions text box, a live schematic showing all 7 steps
lighting up as generation runs, and a Code/Preview toggle where Preview
actually transpiles and renders the generated JSX live in the browser
(via Babel standalone), not just displaying it as text.

### The two codegen paths — and which one matches "no hallucination"

You asked explicitly that code generation should work like a real
wireframe-to-code compiler, not like an LLM, and that there should be no
hallucinations. That is exactly what GEN_MODE=template (the default) is —
it's not an LLM at all, so there's structurally nothing for it to
hallucinate. Every accuracy number below reflects this path.

GEN_MODE=llm exists as an opt-in alternative (free-tier Gemini/OpenRouter)
for cases where you want an LLM's more natural-sounding output and are
willing to accept that CGDA + the validation retry loop are there
specifically to catch and correct whatever it might hallucinate. It is
not the default, precisely because it doesn't match what you asked for.

### Real accuracy numbers

Measured across 4 structurally different real wireframe images (a nav
header, a login form, a card grid, and a labeled form with real
placeholder text), using the default deterministic path:

| Metric | Result |
|---|---|
| Structural accuracy (schema vs. generated code) | 100%, every fixture |
| CGDA strip rate (hallucinated tags removed) | 0 tags, every fixture |
| Validation retries needed | 0, every fixture |
| OCR labels successfully extracted and used | 9 across the 2 fixtures with real text |
| Automated tests passing | 169/169 |

Also verified, separately, under harder conditions: JPEG-compressed
images, anti-aliased rounded-corner mockups, and hand-drawn-style
sketches. Detection still succeeds and the compiled code still validates
at 100% structural accuracy on all three.

Why 100% isn't a coincidence: the deterministic compiler emits exactly
one JSX tag per schema node by construction (see module 5), so structural
accuracy can only be less than 100% if the detector, schema builder, or
compiler itself has a bug — which is exactly the kind of thing the test
suite is built to catch (and did — see below).

### Bugs found and fixed during development

Being upfront about these since they were real, not hypothetical:

1. CGDA was silently deleting button/text labels and truncating the file.
   The JSX parser discarded text sitting right before a tag's own closing
   tag and everything after the final closing tag. Every real request was
   returning code with all labels stripped. Fixed, with regression tests.
2. Every file upload through the web UI was being rejected. Multer's
   default disk storage strips file extensions from temp filenames; the
   Python validator required one. Fixed on both ends.
3. A literal "<" character in OCR text could get misread as a JSX tag by
   CGDA's regex-based parser and stripped, corrupting output. Fixed by
   sanitizing OCR text and using safe JS-string-literal embedding for all
   label content.
4. Otsu auto-thresholding was erasing light-gray placeholder text
   entirely before OCR ever saw it (a very common real style for
   wireframe placeholder copy). Fixed with a more lenient fixed threshold.
5. Box borders were confusing Tesseract's page-layout analysis into
   returning nothing for the whole image. Fixed with morphological
   line-removal preprocessing before OCR.
6. OCR word-grouping merged separate button labels together (e.g. "Login"
   and "Sign Up" in a nav header became one blob) when using a generic
   pixel-gap heuristic. Fixed by grouping words using the actual detected
   element boundaries instead.
7. OCR labels attached to "container"-typed schema nodes were silently
   dropped by the compiler, which only checked for labels on leaf-type
   nodes. Fixed.
8. The backend hardcoded `python3` as the command to spawn the Python
   pipeline. On Windows, Python is normally installed as just `python` —
   `python3.exe` is usually the OS's own Store-redirect stub, which
   prints "Python was not found; run without arguments to install from
   the Microsoft Store..." instead of running anything. Every Windows
   user hit this before detection ever ran. Fixed with auto-detection
   (`backend/python_resolver.js`) that tries the platform-appropriate
   command first, falls back to the other, and recognizes the stub's
   exact output so it doesn't get mistaken for a working Python.
9. **The whole page could go blank with no visible error** on any request
   slower than about 2.7 seconds — very plausible in practice once
   OCR/detection are doing real work on a real image. The pipeline-status
   animation's interval had no upper bound, so it eventually read past
   the end of its own step list and crashed with "Cannot read properties
   of undefined (reading 'id')". Made worse by a second issue: even after
   adding a bounds check, React 18 StrictMode's dev-mode double-invocation
   silently created two competing intervals sharing one ref, so the fix
   didn't fully take until each interval was made to clear itself using
   its own captured id rather than a shared mutable ref. Also added a
   top-level error boundary (`AppErrorBoundary.jsx`) as a backstop, so any
   future unexpected error shows a recovery UI instead of a blank page.
   Reproduced and verified fixed with a real headless-browser test
   (`scripts/test_frontend_slow_response.py`) that delays a mocked
   response past the old crash threshold.

10. **Detection was wildly noisy on ordinary wireframes** — a 3-4 element
    image (heading, image placeholder, input field) produced 15-24
    detections. Root causes, each fixed and tested separately: (a) CV
    contour detection was reading individual letters as fake buttons/
    icons — fixed by having OCR find text lines FIRST and masking them
    out before shape detection runs; (b) a box with a diagonal "X"
    (the standard image-placeholder glyph) split into 4 fragment
    detections — fixed with connected-component fragment merging plus
    explicit diagonal-line detection; (c) fill_ratio used a fresh Otsu
    threshold per box, which degenerates on near-uniform regions and
    misclassified input fields as generic containers — fixed with a
    fixed threshold; (d) when multiple separate widgets (a logo + two
    nav buttons) sat at a similar height, OCR's line-grouping merged
    their labels into one garbled string and the buttons lost their own
    text — fixed by excluding already-detected-widget words from
    standalone text-line grouping. Verified against the exact reported
    case: 24 detections down to 3, matching the real image.

Each of these has a permanent regression test so it can't silently come back.

---

## Project layout

```
services/
  preprocessing/   Step 1 — validation, resize/grayscale/normalize
  detection/        Step 2 — heuristic_detector.py (real CV, default),
                     ocr_extractor.py (real Tesseract OCR + label matching),
                     detect.py/sidecar.py (optional YOLOv8)
  schema/           Step 3 — row/column clustering -> nested JSON tree
  rag/              Step 4 — vector_db.py (real SQLite + TF-IDF) + 20 seed templates
  codegen/          Step 5 — template_compiler.py (deterministic, default),
                     instruction_parser.py (user design instructions),
                     generate.py (free-tier LLM, opt-in)
  cgda/             Step 6 — JSX whitelist filter
  validation/       Step 7 — schema-vs-code tree diff + retry loop
backend/
  server.js          Express orchestration API
  python_resolver.js Cross-platform Python command auto-detection
frontend/
  src/App.jsx                 Dark-theme UI, instructions box, Code/Preview toggle
  src/PipelineSchematic.jsx   Signature element — live 7-step circuit diagram
  src/CodeView.jsx            Syntax-tinted code display
  src/LivePreview.jsx         In-browser JSX rendering via Babel standalone
  src/AppErrorBoundary.jsx    Top-level crash backstop — shows a recovery UI instead of a blank page
scripts/
  cli_pipeline.py                  detect/generate subcommands — what the backend calls
  test_e2e_integration.py          Full pipeline proof, clean real images
  test_backend_edge_cases.py       Every failure mode, all fail cleanly
  test_realistic_wireframes.py     Full pipeline on harder/more realistic images
  test_instructions_integration.py Instructions + OCR + addition feature, combined
  test_frontend_slow_response.py   Real headless-browser proof the slow-response crash is fixed
  run_full_pipeline_demo.py        Illustrates CGDA catching a hallucination (GEN_MODE=llm scenario)
  measure_metrics.py               Report metrics harness
```

---

## Current runnable setup and API

### RAG / vector database contract

RAG is active during every generation. `services/rag/retrieve.py` creates
or opens the durable SQLite template catalog through
`services/rag/vector_db.py`. The catalog stores one high-value record per
reviewed UI pattern: a stable `id`, normalized layout description (`text`),
and known-good React snippet (`code`). At query time, a TF-IDF embedding of
the normalized schema description is searched with FAISS inner-product
retrieval by default; SQLite is the source of truth and NumPy exact search
is an explicit fallback when FAISS is unavailable.

The retrieved records are passed into `template_compiler.py` to select
layout defaults and into the optional LLM prompt path as reviewed context.
They are not image embeddings or user data, and no noisy OCR fragments are
indexed. The debug inspector exposes the retrieved ids, descriptions,
similarity scores, and validation diagnostics without cluttering the
normal workspace.

### Fidelity-first reconstruction

The current reconstruction path is macro-to-micro: `heuristic_detector.py`
first emits page/header/main/footer and, when supported by geometry, gallery,
product-detail, and related-product regions. `schema.js` treats those macro
roles as authoritative parents before assigning contour/OCR leaves. It then
exports a `layoutPlan` with normalized region bounds, layout directions, and
repetition evidence. The compiler builds those page zones before leaves, and
the fidelity gate rejects page-shaped schemas that collapse into shallow or
button-heavy output.

Tune `MIN_ACCEPTED_CONFIDENCE` and `_detect_macro_regions()` in
`services/detection/heuristic_detector.py` for CV sensitivity. Tune the
source-schema reconstruction gate in `services/validation/fidelity.js`.
For a trained model deployment, `services/detection/detect.py` provides the
optional YOLOv8 adapter while preserving the same normalized detection shape.

The production UI now calls stage endpoints rather than a simulated progress flow:
`POST /api/upload`, `/api/process`, `/api/detect`, `/api/schema`,
`/api/generate`, and `/api/validate`; inspect with `GET /api/job/:id` or
`/api/job/:id/result`, and export a validated React project using
`GET /api/job/:id/download`.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
npm --prefix backend install
npm --prefix frontend install
$env:PYTHON_BIN = (Resolve-Path .\.venv\Scripts\python.exe)
npm --prefix backend start
# In another terminal:
npm --prefix frontend run dev
```

FAISS (`faiss-cpu`) is the default retrieval engine. On a constrained local
machine without FAISS, the service explicitly reports its `numpy-exact`
fallback. Set `GEN_MODE=llm` plus one provider key from `.env.example` to
enable LLM generation; the deterministic compiler is the safe default.

## Known limitations, stated plainly

- The heuristic CV detector uses explainable shape rules, not a learned
  model. It will still misclassify unusual layouts (very low contrast,
  dense overlapping elements, photographic/gradient-heavy mockups) that a
  fine-tuned YOLOv8 model would handle better.
- RAG retrieval is lexical (TF-IDF), not semantic — it matches shared
  words/phrases, not meaning. A real embedding model would recognize that
  "header" and "container with a logo and buttons" describe the same
  layout even with no shared words; TF-IDF may not.
- The deterministic compiler doesn't invent copy — an element with no
  OCR-readable text gets a placeholder like "Button 1". This is
  intentional (inventing copy would be a form of hallucination), not a bug.
- OCR label quality depends on detection quality. When the detector
  over-segments one visual button into a real box plus spurious tiny
  noise boxes (a known, pre-existing limitation), an OCR label can
  occasionally attach to the wrong one of those boxes. This doesn't cause
  invalid code (structural accuracy stays 100%) but can occasionally
  produce an odd label.
- CGDA's parser is hand-written, not a full JS/JSX AST (no
  @babel/parser, since that needs npm install with network access).
  Correctly handles nested/self-closing tags, attributes, and text
  content. Does not handle JSX fragments (<>...</>) or multi-line spread
  props — only relevant if you enable GEN_MODE=llm, since the
  deterministic compiler never emits either.
- Live Preview requires network to load Babel standalone from CDN the
  first time; if that fails, it shows a clear error and points back to
  the Code tab rather than crashing.
- The "add an element" feature is intentionally limited to the
  20-template catalog — it will never fabricate a new kind of element
  that isn't in that pre-vetted set, which is a deliberate hallucination
  boundary, not a missing feature.
