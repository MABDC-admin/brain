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
        logger.error(f"Embedding error: {e}")
        return [0.0] * 1536

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """Splits a long document into smaller overlapping chunks for vector search."""
    if not text:
        return []
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += (chunk_size - overlap)
    return chunks
