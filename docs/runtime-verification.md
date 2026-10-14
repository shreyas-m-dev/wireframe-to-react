# Runtime verification

Verified on 2026-09-01 from repository root.

| Check | Exact result |
|---|---|
| Project Python | `C:\Users\shett\Downloads\wireframe-to-react\wireframe-to-react\.venv\Scripts\python.exe` |
| Python | 3.11.5 |
| pip | 26.2.1 |
| Node | v22.20.0 |
| npm | 10.9.3 |
| SQLite | 3.41.2 |
| NumPy | 2.4.6 |
| OpenCV | 4.10.0 |
| scikit-learn | 1.9.0 |
| FAISS | 1.15.0 |
| Pillow | 12.3.0 |
| pytesseract | 0.3.13 |
| Tesseract executable | `C:\Program Files\Tesseract-OCR\tesseract.exe` resolved by shared OCR configuration; version 5.5.3.20260724 |
| PyTorch/CUDA | PyTorch missing; CUDA not testable |
| Docker/pyproject/YAML runtime config | none found |
| Backend health endpoint | `GET http://127.0.0.1:3000/api/health` returned `{"status":"ok","jobs":4,"retrieval":"faiss"}` |

The global `python` resolves to `C:\msys64\mingw64\bin\python.exe`; do not use it for this project. The backend resolves Python through `backend/python_resolver.js`; set `PYTHON_BIN` to the `.venv` executable to remove ambiguity.

Port 3000 was already occupied by the running backend during verification, and
its health endpoint responded successfully. Do not start a second backend
process while that service is running.

```powershell
cd C:\Users\shett\Downloads\wireframe-to-react\wireframe-to-react
.\.venv\Scripts\Activate.ps1
$env:PYTHON_BIN = (Resolve-Path .\.venv\Scripts\python.exe)
python -m pip install -r requirements.txt
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend start
# second terminal
npm --prefix frontend run dev
```

Classical CV requires `numpy`, `opencv-python-headless`, and scikit-learn; those are installed. OCR Python bindings exist, but actual OCR remains unavailable until the Tesseract executable is installed and on PATH. Semantic local embeddings additionally require `pip install -r requirements-rag.txt`; that may download the selected embedding model on first use. Optional YOLO needs `services/detection/requirements.txt`, weights, and a deliberate adapter configuration; it is not installed by this setup.
