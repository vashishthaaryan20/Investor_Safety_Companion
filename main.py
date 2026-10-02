import base64
import importlib.util
from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from phishing_detector.ocr import analyze_image

app = FastAPI()

# Matches the payload from saveScreenshotAsJson()
class ImagePayload(BaseModel):
    image: str


# -------------------------------------------------------------------
# Endpoint 1: Handles saveScreenshotAsJson() [Base64 JSON]
# -------------------------------------------------------------------
@app.post("/api/v1/save-image-json")
async def save_image_json(payload: ImagePayload):
    try:
        base64_str = payload.image
        
        # Remove metadata header if Expo included one (e.g., "data:image/jpeg;base64,...")
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]

        # Decode Base64 into raw image bytes
        image_bytes = base64.b64decode(base64_str)

        # Run your OCR / analysis function
        analysis = analyze_image(image_bytes)

        return {
            "message": "Image processed successfully",
            "saved_to": "memory",
            "result": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# -------------------------------------------------------------------
# Endpoint 2: Handles sendScreenshotForAnalysis() [FormData upload]
# -------------------------------------------------------------------
@app.post("/api/v1/analyze")
async def analyze_screenshot(image: UploadFile = File(...)):
    try:
        # Read the raw binary bytes directly from the uploaded file
        image_bytes = await image.read()

        # Run your analysis
        analysis_data = analyze_image(image_bytes)

        # Structure response to match her TypeScript AnalysisResult interface
        return {
            "status": "success",
            "extracted_text": analysis_data.get("extracted_text", ""),
            "detected_urls": analysis_data.get("detected_urls", []),
            "analysis_mode": "ocr",
            "risk": {
                "level": analysis_data.get("risk_level", "low"),
                "score": analysis_data.get("risk_score", 0)
            },
            "signals": analysis_data.get("signals", []),
            "explanation": analysis_data.get("explanation", "Analysis complete."),
            "verification": analysis_data.get("verification", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))