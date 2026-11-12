const minimumQuestions = 3;
const maximumQuestions = 5;
const recommendedCategories = 3;

export function evaluateReportQuality({ input, report, coverage, profile }) {
  if (profile !== "standard" && profile !== "strict") {
    throw new Error('--quality must be "standard" or "strict".');
  }
  const strict = profile === "strict";
  const errors = [];
  const warnings = [];
  const severity = strict ? "error" : "warning";
  const gates = {
    structure: {
      id: "structure",
      status: "pass",
      checked: 0,
      total: report.matches.length,
      issues: [],
    },
    questions: {
      id: "questions",
      status: "pass",
      checked: 0,
      total: report.matches.length,
      minimumPerMatch: minimumQuestions,
      totalQuestions: 0,
      issues: [],
    },
    coverage: {
      id: "coverage",
      status: "pass",
      mode: coverage === undefined ? "distinct-categories" : "declared",
      expected: coverage ?? null,
      covered: [],
      issues: [],
    },
  };

  const record = (gate, issueSeverity, message) => {
    gate.issues.push({ severity: issueSeverity, message });
    if (issueSeverity === "error") {
      errors.push(message);
      gate.status = "fail";
    } else {
      warnings.push(message);
      if (gate.status === "pass") gate.status = "warn";
    }
  };

  const titles = new Map();
  report.matches.forEach((match, index) => {
    const firstIndex = titles.get(match.title);
    if (firstIndex === undefined) {
      titles.set(match.title, index);
    } else {
      record(
        gates.structure,
        "error",
        `matches[${index}] duplicates the title of matches[${firstIndex}]: ${JSON.stringify(match.title)} (structure)`,
      );
    }
  });

  report.matches.forEach((match, index) => {
    const raw = input.matches[index];
    let complete = true;
    if (raw.category === undefined) {
      record(
        gates.structure,
        severity,
        `matches[${index}] is missing category; the report falls back to "项目实现" (structure)`,
      );
      complete = false;
    }
    if (match.analysis === null) {
      record(
        gates.structure,
        severity,
        `matches[${index}] is missing analysis with flow, tradeoffs and limits (structure)`,
      );
      complete = false;
    }
    if (complete) gates.structure.checked += 1;

    gates.questions.totalQuestions += match.questions.length;
    if (match.questions.length < minimumQuestions) {
      record(
        gates.questions,
        severity,
        `matches[${index}] has ${match.questions.length} interview questions; at least ${minimumQuestions} required (questions)`,
      );
    } else {
      gates.questions.checked += 1;
      if (match.questions.length > maximumQuestions) {
        record(
          gates.questions,
          "warning",
          `matches[${index}] has ${match.questions.length} interview questions; ${minimumQuestions}–${maximumQuestions} keeps the report focused (questions)`,
        );
      }
    }
  });

  const categories = new Set(report.matches.map((match) => match.category));
  if (coverage !== undefined) {
    const disclosed = report.gaps.join("\n");
    for (const item of coverage) {
      if (categories.has(item) || disclosed.includes(item)) {
        gates.coverage.covered.push(item);
      } else {
        record(
          gates.coverage,
          severity,
          `declared coverage ${JSON.stringify(item)} is not represented by any match category and is not disclosed in gaps (coverage)`,
        );
      }
    }
  } else if (report.matches.length) {
    const expected = Math.min(recommendedCategories, report.matches.length);
    gates.coverage.expected = expected;
    gates.coverage.covered = [...categories];
    if (categories.size < expected) {
      record(
        gates.coverage,
        severity,
        `report covers ${categories.size} distinct categories; expected at least ${expected}. Declare "coverage" if the role spans fewer areas (coverage)`,
      );
    }
  }

  return {
    profile,
    ok: errors.length === 0,
    errors,
    warnings,
    gates: [gates.structure, gates.questions, gates.coverage],
  };
}
