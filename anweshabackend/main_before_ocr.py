from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(
    title="SANGYAN Shield API",
    description="Investor Safety and Resilience Engine API",
    version="1.0.0"
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/api/v1/health")
def health_check():

    return {
        "status": "ok",
        "message": "SANGYAN Shield API is running"
    }


# --------------------------------------------------
# SCREENSHOT ANALYSIS
# --------------------------------------------------

@app.post("/api/v1/analyze")
async def analyze_screenshot(
    image: UploadFile = File(...)
):

    print()
    print("=" * 60)
    print("SANGYAN ANALYSIS REQUEST")
    print("=" * 60)

    print("Filename:", image.filename)
    print("Content type:", image.content_type)

    # Read the uploaded image
    image_bytes = await image.read()

    print("Image size:", len(image_bytes), "bytes")

    print("=" * 60)
    print("Returning test analysis result")
    print("=" * 60)

    result = {
        "status": "success",

        "risk": {
            "level": "HIGH_ATTENTION",
            "score": 8
        },

        "signals": [
            {
                "category": "content",
                "severity": "high",
                "title": "Guaranteed return claim",
                "description": (
                    "The content appears to promise "
                    "unusually high or guaranteed returns."
                )
            },
            {
                "category": "behavior",
                "severity": "medium",
                "title": "Urgency detected",
                "description": (
                    "The message appears to encourage "
                    "immediate action."
                )
            }
        ],

        "explanation": (
            "This content contains multiple "
            "investor-safety warning indicators."
        ),

        "verification": [
            "Verify the source independently.",
            "Do not share OTPs, passwords, or sensitive information.",
            "Check official investor-protection resources."
        ]
    }

    print("Result being returned:")
    print(result)

    return result