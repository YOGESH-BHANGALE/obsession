"""
NVIDIA Nemotron Service.
Provides natural-language AI Investigator Assistant capabilities backed by NVIDIA Nemotron.
Enforces strict evidentiary grounding, anti-hallucination guardrails, and analytical tone.
"""
import logging
import re
from typing import List, Dict, Any, Optional
import openai

from app.config import get_nemotron_config

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the AI Investigator Assistant for the Criminal Network Analysis Platform, assisting authorized law enforcement and intelligence investigators.

EVIDENTIARY GUARDRAILS & INVESTIGATIVE GUIDELINES:
1. Grounding: Answer strictly and exclusively using the provided Case Evidence Context.
2. Anti-Hallucination: NEVER invent names, entities, phone numbers, transaction amounts, dates, or relationships not documented in the context.
3. Unknowns: If an entity or topic is not mentioned or has no records in the provided evidence, state clearly: "According to current case files, there is no recorded evidence regarding [subject]."
4. Analytical Demeanor: Suspicion scores, hierarchy scores, and centrality metrics are algorithmic indicators, NOT definitive proof of guilt. Never declare an individual legally guilty or convicted unless an explicit court conviction is documented in the evidence records.
5. Distinction of Sources: Clearly distinguish between empirical evidence (CDR call logs, financial transfers, surveillance observations, FIRs) and algorithmic findings (bridge detection, burst anomalies, circular money flows).
6. Formatting: Provide direct, professional, well-structured answers using markdown bullet points and bold highlights.
7. Direct Output: Output ONLY your final investigative response. Do NOT output scratchpad notes, planning thoughts, or internal reasoning blocks.
"""


def clean_nemotron_output(text: str) -> str:
    """Removes any internal reasoning blocks or thinking tags if present."""
    if not text:
        return ""

    # Remove <think>...</think> tags if present
    if "<think>" in text and "</think>" in text:
        text = text.split("</think>")[-1].strip()

    # If the model outputs a thinking process preamble
    if "thinking process:" in text.lower():
        blocks = re.split(r'\n\s*\n', text)
        answer_blocks = []
        in_thinking = True
        for b in blocks:
            b_strip = b.strip()
            if in_thinking:
                if "thinking process:" in b_strip.lower():
                    continue
                if re.match(r'^(?:\d+\.|\*|\-|\bStep\b|\bDraft\b)', b_strip) and any(
                    k in b_strip for k in ["Analyze", "Extract", "Synthesize", "Format", "Refine", "Determine", "Identify", "Assess"]
                ):
                    continue
                in_thinking = False
                answer_blocks.append(b)
            else:
                answer_blocks.append(b)
        if answer_blocks:
            return "\n\n".join(answer_blocks).strip()

    return text.strip()


def get_client() -> Optional[openai.OpenAI]:
    """Initializes and returns OpenAI client for NVIDIA API."""
    cfg = get_nemotron_config()
    api_key = cfg.get("api_key")
    if not api_key:
        logger.error("NVIDIA_API_KEY is not set.")
        return None
    return openai.OpenAI(
        base_url=cfg.get("base_url", "https://integrate.api.nvidia.com/v1"),
        api_key=api_key
    )


def ask_investigator(
    question: str,
    evidence_context: str,
    citations: List[str],
    case_title: str = ""
) -> Dict[str, Any]:
    """
    Sends user inquiry with grounded evidence context to NVIDIA Nemotron.
    Returns structured answer and citations used.
    """
    cfg = get_nemotron_config()
    client = get_client()

    if not client:
        return {
            "answer": "AI Investigator Assistant is unavailable: NVIDIA API key is not configured in backend environment.",
            "evidence_used": citations,
            "model": cfg.get("model", "unknown"),
            "status": "error"
        }

    user_prompt = f"""### ACTIVE CASE: {case_title or 'Criminal Network Investigation'}

### CASE EVIDENCE CONTEXT:
{evidence_context}

---
### INVESTIGATOR INQUIRY:
{question}

Provide an objective, evidence-grounded assessment for the investigator based only on the evidence above."""

    try:
        completion = client.chat.completions.create(
            model=cfg.get("model", "nvidia/nemotron-3.5-lightning-30b-a3b"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            max_tokens=1024,
            timeout=30.0
        )

        raw_answer = completion.choices[0].message.content or ""
        cleaned = clean_nemotron_output(raw_answer)

        return {
            "answer": cleaned,
            "evidence_used": citations,
            "model": cfg.get("model"),
            "status": "success"
        }

    except openai.RateLimitError as e:
        logger.error(f"NVIDIA API rate limit error: {e}")
        return {
            "answer": "The AI Assistant request rate limit was reached. Please try again in a few moments.",
            "evidence_used": citations,
            "model": cfg.get("model"),
            "status": "rate_limited"
        }
    except openai.APITimeoutError as e:
        logger.error(f"NVIDIA API timeout: {e}")
        return {
            "answer": "The request to the AI model timed out. Please try asking again.",
            "evidence_used": citations,
            "model": cfg.get("model"),
            "status": "timeout"
        }
    except Exception as e:
        logger.error(f"Unexpected error communicating with NVIDIA Nemotron: {e}")
        return {
            "answer": f"An error occurred while analyzing the inquiry: {str(e)}",
            "evidence_used": citations,
            "model": cfg.get("model"),
            "status": "error"
        }

import json

def ask_investigator_stream(
    question: str,
    evidence_context: str,
    citations: List[str],
    case_title: str = ""
):
    """
    Generator that streams the response from NVIDIA Nemotron using Server-Sent Events (SSE).
    """
    cfg = get_nemotron_config()
    client = get_client()
    model_name = cfg.get("model", "nvidia/nemotron-3.5-lightning-30b-a3b")

    if not client:
        yield f"data: {json.dumps({'type': 'error', 'text': 'NVIDIA API key not configured'})}\n\n"
        return

    user_prompt = f"""### ACTIVE CASE: {case_title or 'Criminal Network Investigation'}

### CASE EVIDENCE CONTEXT:
{evidence_context}

---
### INVESTIGATOR INQUIRY:
{question}

Provide an objective, evidence-grounded assessment for the investigator based only on the evidence above."""

    try:
        completion = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            max_tokens=1024,
            timeout=30.0,
            stream=True
        )
        
        in_thinking = False
        
        for chunk in completion:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if getattr(delta, 'content', None):
                text_chunk = delta.content
                
                # Basic suppression of thinking blocks
                if "<think>" in text_chunk:
                    in_thinking = True
                    text_chunk = text_chunk.replace("<think>", "")
                if "</think>" in text_chunk:
                    in_thinking = False
                    text_chunk = text_chunk.replace("</think>", "")
                    continue
                    
                if not in_thinking and text_chunk:
                    yield f"data: {json.dumps({'type': 'chunk', 'text': text_chunk})}\n\n"
        
        # Send final metadata
        yield f"data: {json.dumps({'type': 'done', 'citations': citations, 'model': model_name})}\n\n"

    except openai.RateLimitError as e:
        yield f"data: {json.dumps({'type': 'error', 'text': 'Rate limit exceeded'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"

