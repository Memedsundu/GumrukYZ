"""
GümrükYZ OCR Microservice
Tier 2 extraction: PyMuPDF + Tesseract for scanned/image PDFs.

Deploy on Railway. Called by the Next.js processing pipeline when
pdfjs-dist text extraction confidence < 0.5.
"""
import io
import os
import hashlib
import hmac
import statistics
from typing import Optional

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from pydantic import BaseModel

app = FastAPI(title="GümrükYZ OCR Service", version="0.1.0")

OCR_SERVICE_SECRET = os.environ.get("OCR_SERVICE_SECRET", "")

def get_tesseract_lang() -> str:
    try:
        langs = set(pytesseract.get_languages(config=""))
    except Exception:
        return "eng"

    if "tur" in langs and "eng" in langs:
        return "tur+eng"
    if "tur" in langs:
        return "tur"
    return "eng"


TESSERACT_LANG = get_tesseract_lang()


class OcrResult(BaseModel):
    text: str
    confidence: float
    page_count: int
    method: str = "OCR_PYTHON"


def verify_secret(x_ocr_secret: Optional[str]) -> None:
    if not OCR_SERVICE_SECRET:
        return  # No secret configured — skip in dev
    if not x_ocr_secret:
        raise HTTPException(status_code=401, detail="Missing X-OCR-Secret header")
    if not hmac.compare_digest(x_ocr_secret, OCR_SERVICE_SECRET):
        raise HTTPException(status_code=403, detail="Invalid OCR secret")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr", "language": TESSERACT_LANG}


@app.post("/ocr", response_model=OcrResult)
async def ocr_pdf(
    file: UploadFile = File(...),
    x_ocr_secret: Optional[str] = Header(None, alias="X-OCR-Secret"),
):
    verify_secret(x_ocr_secret)

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")

    try:
        pdf_document = fitz.open(stream=contents, filetype="pdf")
        page_count = len(pdf_document)
        all_text = []
        page_confidences = []

        for page_num in range(min(page_count, 20)):
            page = pdf_document[page_num]

            # Render page to image at 300 DPI for good OCR quality
            mat = fitz.Matrix(300 / 72, 300 / 72)
            clip = page.rect
            pix = page.get_pixmap(matrix=mat, clip=clip)

            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))

            # Run Tesseract with confidence data
            ocr_data = pytesseract.image_to_data(
                img,
                lang=TESSERACT_LANG,
                output_type=pytesseract.Output.DICT,
            )

            page_text_parts = []
            confidences = []

            for i, word in enumerate(ocr_data["text"]):
                if word.strip():
                    page_text_parts.append(word)
                    conf = ocr_data["conf"][i]
                    if isinstance(conf, (int, float)) and conf >= 0:
                        confidences.append(float(conf) / 100.0)

            page_text = " ".join(page_text_parts)
            all_text.append(page_text)

            page_conf = statistics.mean(confidences) if confidences else 0.0
            page_confidences.append(page_conf)

        full_text = "\n".join(all_text).strip()
        overall_confidence = statistics.mean(page_confidences) if page_confidences else 0.0

        return OcrResult(
            text=full_text,
            confidence=round(overall_confidence, 3),
            page_count=page_count,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
