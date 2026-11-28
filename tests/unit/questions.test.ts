/**
 * Unit tests for question types, answer checking, grading methods and random picks
 * (Phase 3, 4.4). Run: npm run test:unit
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradedResult, isCorrect, normalizeShortAnswer, parseTags, questionInput, scoreAttempt, type AnswerKey, type Response } from "../../src/lib/questions";
import { buildLayout, chooseQuestions, givenQuestionIds } from "../../src/lib/quiz-engine";

const none: Response = { selectedIndex: null, selectedIndexes: null, textAnswer: null, numberAnswer: null };
const key = (k: Partial<AnswerKey> & Pick<AnswerKey, "type">): AnswerKey => ({ correctIndex: null, correctIndexes: null, acceptedAnswers: null, numericAnswer: null, tolerance: null, ...k });

describe("answer checking", () => {
  it("single choice and true/false compare the original option index", () => {
    assert.equal(isCorrect(key({ type: "single", correctIndex: 2 }), { ...none, selectedIndex: 2 }), true);
    assert.equal(isCorrect(key({ type: "single", correctIndex: 2 }), { ...none, selectedIndex: 1 }), false);
    assert.equal(isCorrect(key({ type: "true_false", correctIndex: 1 }), { ...none, selectedIndex: 1 }), true);
    assert.equal(isCorrect(key({ type: "single", correctIndex: 0 }), undefined), false);
  });
  it("multiple answer is all-or-nothing", () => {
    const q = key({ type: "multiple", correctIndexes: [0, 2] });
    assert.equal(isCorrect(q, { ...none, selectedIndexes: [2, 0] }), true);
    assert.equal(isCorrect(q, { ...none, selectedIndexes: [0] }), false, "missing one");
    assert.equal(isCorrect(q, { ...none, selectedIndexes: [0, 1, 2] }), false, "one extra");
    assert.equal(isCorrect(q, { ...none, selectedIndexes: [] }), false);
  });
  it("short answer: trimmed, case-insensitive, whitespace collapsed, exact otherwise", () => {
    const q = key({ type: "short_answer", acceptedAnswers: ["Binary Search Tree", "BST"] });
    assert.equal(isCorrect(q, { ...none, textAnswer: "  binary   search tree " }), true);
    assert.equal(isCorrect(q, { ...none, textAnswer: "bst" }), true);
    assert.equal(isCorrect(q, { ...none, textAnswer: "binary search trees" }), false);
    assert.equal(isCorrect(q, { ...none, textAnswer: "   " }), false);
    assert.equal(normalizeShortAnswer(" A\t B "), "a b");
  });
  it("numerical: value ± tolerance, inclusive, robust to float noise", () => {
    const q = key({ type: "numerical", numericAnswer: 0.3, tolerance: 0 });
    assert.equal(isCorrect(q, { ...none, numberAnswer: 0.1 + 0.2 }), true);
    const t = key({ type: "numerical", numericAnswer: 9.81, tolerance: 0.05 });
    assert.equal(isCorrect(t, { ...none, numberAnswer: 9.86 }), true);
    assert.equal(isCorrect(t, { ...none, numberAnswer: 9.87 }), false);
    assert.equal(isCorrect(t, { ...none, numberAnswer: Number.NaN }), false);
  });
});

describe("scores and grading methods", () => {
  it("an attempt scores the points of its correct answers", () => {
    const given = [
      { id: "a", points: 1, ...key({ type: "single", correctIndex: 0 }) },
      { id: "b", points: 3, ...key({ type: "numerical", numericAnswer: 10, tolerance: 0 }) },
    ];
    const answers = new Map<string, Response>([["a", { ...none, selectedIndex: 0 }], ["b", { ...none, numberAnswer: 10 }]]);
    assert.equal(scoreAttempt(given, answers), 4);
    answers.delete("b");
    assert.equal(scoreAttempt(given, answers), 1);
  });
  it("highest / average / first / last", () => {
    const a = [{ attemptNumber: 2, score: 4, total: 5 }, { attemptNumber: 1, score: 1, total: 5 }, { attemptNumber: 3, score: 2, total: 5 }];
    assert.deepEqual(gradedResult(a, "highest"), { score: 4, total: 5 });
    assert.deepEqual(gradedResult(a, "first"), { score: 1, total: 5 });
    assert.deepEqual(gradedResult(a, "last"), { score: 2, total: 5 });
    assert.deepEqual(gradedResult(a, "average"), { score: 2.33, total: 5 });
    assert.equal(gradedResult([], "highest"), null);
  });
});

describe("question validation", () => {
  it("accepts the pre-4.4 payload as a 1-point single-choice question", () => {
    const r = questionInput.parse({ prompt: "2+2?", options: ["4", "5"], correctIndex: 0 });
    assert.equal(r.type, "single");
    assert.equal(r.points, 1);
    assert.equal(r.correctIndex, 0);
  });
  it("keeps only the columns a type uses", () => {
    const r = questionInput.parse({ type: "short_answer", prompt: "LIFO?", options: ["x"], correctIndex: 0, acceptedAnswers: ["Stack", " stack ", ""] });
    assert.deepEqual(r.options, []);
    assert.equal(r.correctIndex, null);
    assert.deepEqual(r.acceptedAnswers, ["Stack"]);
    const tf = questionInput.parse({ type: "true_false", prompt: "Sky is blue", correctIndex: 0 });
    assert.deepEqual(tf.options, ["True", "False"]);
  });
  it("refuses incomplete answer keys and bad points", () => {
    assert.equal(questionInput.safeParse({ type: "multiple", prompt: "x", options: ["a", "b"], correctIndexes: [] }).success, false);
    assert.equal(questionInput.safeParse({ type: "numerical", prompt: "x", tolerance: 1 }).success, false);
    assert.equal(questionInput.safeParse({ type: "numerical", prompt: "x", numericAnswer: 1, tolerance: -1 }).success, false);
    assert.equal(questionInput.safeParse({ type: "short_answer", prompt: "x", acceptedAnswers: ["  "] }).success, false);
    assert.equal(questionInput.safeParse({ prompt: "x", options: ["a", "b"], correctIndex: 0, points: 0 }).success, false);
    assert.equal(questionInput.safeParse({ prompt: "x", options: ["a", "b"], correctIndex: 0, points: 1.5 }).success, false);
  });
  it("tags are trimmed, lower-cased and de-duplicated", () => {
    assert.deepEqual(parseTags(" Trees, BST ,trees,, "), ["trees", "bst"]);
  });
});

describe("random slots", () => {
  const qs = [
    { id: "f1", position: 0, slotId: null },
    ...["p1", "p2", "p3", "p4"].map((id) => ({ id, position: 1, slotId: "s" })),
    { id: "f2", position: 2, slotId: null },
  ];
  const slots = [{ id: "s", position: 1, pickCount: 2 }];
  it("gives every fixed question plus N distinct picks, in quiz order", () => {
    const given = chooseQuestions(qs, slots).map((q) => q.id);
    assert.equal(given.length, 4);
    assert.equal(given[0], "f1");
    assert.equal(given[3], "f2");
    assert.equal(new Set(given).size, 4);
  });
  it("prefers the least-used pool questions, so neighbours get different picks", () => {
    const first = chooseQuestions(qs, slots).filter((q) => q.slotId).map((q) => q.id);
    const usage = new Map(first.map((id) => [id, 1]));
    const second = chooseQuestions(qs, slots, usage).filter((q) => q.slotId).map((q) => q.id);
    assert.equal(second.filter((id) => first.includes(id)).length, 0);
  });
  it("pre-4.0 attempts without a layout are given every fixed question", () => {
    assert.deepEqual(givenQuestionIds(null, qs), ["f1", "f2"]);
  });
  it("true/false options are never shuffled", () => {
    const l = buildLayout([{ id: "t", options: ["True", "False"], type: "true_false" }], true);
    assert.deepEqual(l.optionOrders.t, [0, 1]);
  });
});
