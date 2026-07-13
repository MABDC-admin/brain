import os
import logging
from typing import List, Dict, Any, Optional
from litellm import acompletion

logger = logging.getLogger("commandbrain")

async def call_llm_async(model: str, messages: List[Dict[str, Any]], temperature: float = 0.0, max_tokens: Optional[int] = None) -> Optional[str]:
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("No API key found for LLM call.")
        return None
        
    # litellm requires the provider prefix for openrouter (e.g. openrouter/openai/gpt-4o-mini)
    # If the model doesn't have a prefix, we can assume it's openrouter if OPENROUTER_API_KEY is used.
    if not model.startswith("openrouter/") and os.getenv("OPENROUTER_API_KEY"):
        model = f"openrouter/{model}"

    try:
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            api_key=api_key,
            max_tokens=max_tokens
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error("LiteLLM call failed: %s", e)
        return None
