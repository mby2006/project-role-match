from rag_pipeline import retrieve


def hit_rate(cases, store) -> float:
    hits = 0
    for case in cases:
        chunks = retrieve(case["question"], store)
        retrieved = {f"{chunk.doc_id}#{chunk.index}" for chunk in chunks}
        if retrieved & set(case["expected_sources"]):
            hits += 1
    return hits / len(cases) if cases else 0.0


def citation_coverage(answers, expected_sources) -> float:
    covered = 0
    for answer, expected in zip(answers, expected_sources):
        sources = set(answer.get("sources", []))
        if set(expected).issubset(sources):
            covered += 1
    return covered / len(answers) if answers else 0.0
