import os
import logging
from litellm import embedding

logger = logging.getLogger("commandbrain")

def generate_embedding(text: str) -> list[float]:
    if not text.strip():
        return [0.0] * 1536
    
    # We use litellm to abstract the embedding call.
    # Defaulting to OpenAI's text-embedding-3-small (1536 dims).
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set. Returning zero-embedding for testing.")
        return [0.0] * 1536
        
    try:
        response = embedding(
            model="text-embedding-3-small", 
            input=[text[:8000]],
            api_key=api_key
        )
        return response.data[0]["embedding"]
    except Exception as e:
        logger.error("Failed to generate embedding: %s", e)
        return [0.0] * 1536
