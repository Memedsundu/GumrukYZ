# GümrükYZ OCR Service

Tier 2 OCR microservice for GümrükYZ. Handles scanned and image-only PDFs using PyMuPDF + Tesseract.

## Local development

```bash
pip install -r requirements.txt
# macOS: brew install tesseract tesseract-lang
# Ubuntu: apt-get install tesseract-ocr tesseract-ocr-tur
uvicorn main:app --reload --port 8001
```

The service uses Turkish + English OCR when both Tesseract language packs are
available. If the Turkish pack is missing in a local dev environment, it falls
back to English instead of failing the OCR request.

## API

### `POST /ocr`

Upload a PDF file for OCR extraction.

**Headers:**
- `X-OCR-Secret`: shared secret (matches `OCR_SERVICE_SECRET` env var)

**Body:** `multipart/form-data` with `file` field (PDF)

**Response:**
```json
{
  "text": "extracted text...",
  "confidence": 0.87,
  "page_count": 3,
  "method": "OCR_PYTHON"
}
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `OCR_SERVICE_SECRET` | Shared secret for request authentication |
| `PORT` | Port to listen on (set automatically by Railway) |

## Deploy to Railway

1. Connect this directory to a Railway project
2. Set `OCR_SERVICE_SECRET` environment variable
3. Railway auto-detects `nixpacks` and installs Tesseract
