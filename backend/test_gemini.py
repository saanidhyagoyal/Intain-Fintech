import asyncio
from app.core.config import get_settings
from app.services.ai_assistant import _call_gemini

settings = get_settings()
print(f"Gemini Key loaded: {settings.GEMINI_API_KEY[:10]}...")

async def main():
    try:
        res = await _call_gemini("Say hi, this is a test.")
        print("Success:", res)
    except Exception as e:
        print("Error:", repr(e))

asyncio.run(main())
