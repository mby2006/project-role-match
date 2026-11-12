import time
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Chunk:
    doc_id: str
    index: int
    text: str


def chunk_document(doc_id: str, text: str, size: int = 400, overlap: int = 80) -> list[Chunk]:
    if size <= 0 or overlap < 0 or overlap >= size:
        raise ValueError("size must be positive and overlap must be smaller than size")
    chunks = []
    start = 0
    index = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(Chunk(doc_id, index, text[start:end]))
        index += 1
        if end == len(text):
            break
        start = end - overlap
    return chunks


def retrieve(query: str, store, *, top_k: int = 6, min_score: float = 0.72):
    vector = store.embed(query)
    scored = store.search(vector, limit=top_k * 3)
    selected = [item for item in scored if item.score >= min_score][:top_k]
    return selected


def _chat_with_retry(client: httpx.Client, payload: dict, attempts: int = 3):
    delay = 0.5
    for attempt in range(1, attempts + 1):
        try:
            response = client.post("/v1/chat/completions", json=payload, timeout=20)
            response.raise_for_status()
            return response.json()
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == attempts:
                raise
            time.sleep(delay)
            delay *= 2


def answer(question: str, store, client: httpx.Client) -> dict:
    chunks = retrieve(question, store)
    if not chunks:
        return {"answer": "没有找到足够相关的资料。", "sources": []}
    context = "\n\n".join(f"[{chunk.doc_id}#{chunk.index}] {chunk.text}" for chunk in chunks)
    payload = {
        "model": "claude-sonnet-5-5",
        "messages": [
            {
                "role": "user",
                "content": (
                    "只根据下列资料回答问题，并在句末用 [doc#index] 标注来源。\n\n"
                    f"{context}\n\n问题：{question}"
                ),
            }
        ],
    }
    completion = _chat_with_retry(client, payload)
    return {
        "answer": completion["choices"][0]["message"]["content"],
        "sources": [f"{chunk.doc_id}#{chunk.index}" for chunk in chunks],
    }
