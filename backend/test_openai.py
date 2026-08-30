import asyncio
from app.core.config import get_settings
from app.services.ai_assistant import _call_openai

settings = get_settings()
print(f"Key loaded: {settings.CHATGPT_API_KEY[:10]}...")

async def main():
    try:
        res = await _call_openai("Say hi")
        print("Success:", res)
    except Exception as e:
        print("Error:", repr(e))

asyncio.run(main())
