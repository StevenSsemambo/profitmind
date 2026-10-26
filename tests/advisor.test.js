import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { handler } = require("../netlify/functions/advisor.js");

let ipCounter = 0;
const call = (body = { question: "why is sugar low?", digest: "Sugar: 6 left", priorTurns: [] }, headers = {}) =>
  handler({
    httpMethod: "POST",
    headers: { host: "shop.netlify.app", "x-nf-client-connection-ip": `10.0.0.${++ipCounter}`, ...headers },
    body: JSON.stringify(body),
  });

const geminiOk = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text }] } }] }) });
const groqOk = (text) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) });
const fail = (status) => ({ ok: false, status, json: async () => ({}) });

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    for (const [match, fn] of routes) if (url.includes(match)) return fn(calls.length, body);
    throw new Error("unexpected url " + url);
  });
  return calls;
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "gem-key";
  process.env.GROQ_API_KEY = "groq-key";
  delete process.env.GEMINI_MODEL; delete process.env.GEMINI_FALLBACK_MODEL;
  delete process.env.GROQ_MODEL; delete process.env.GROQ_FALLBACK_MODEL;
});

describe("advisor provider chain", () => {
  it("uses Gemini first and ignores thought parts", async () => {
    const calls = mockFetch([["generativelanguage", () => geminiOk("Sugar is low because…")]]);
    const r = await call();
    const body = JSON.parse(r.body);
    expect(body.text).toBe("Sugar is low because…");
    expect(body.provider).toBe("gemini:gemini-3.8-flash");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("models/gemini-3.8-flash:generateContent");
    expect(calls[0].init.headers["x-goog-api-key"]).toBe("gem-key");
    expect(calls[0].body.system_instruction.parts[0].text).toContain("Sugar: 6 left");
    expect(calls[0].body.contents.at(-1)).toEqual({ role: "user", parts: [{ text: "why is sugar low?" }] });
  });

  it("falls to the second Gemini model when the first is rate limited", async () => {
    mockFetch([["generativelanguage", (n) => (n === 1 ? fail(429) : geminiOk("lite answer"))]]);
    const body = JSON.parse((await call()).body);
    expect(body.provider).toBe("gemini:gemini-3.5-flash-lite");
  });

  it("falls to Groq when both Gemini models fail", async () => {
    const calls = mockFetch([["generativelanguage", () => fail(503)], ["groq.com", () => groqOk("groq answer")]]);
    const body = JSON.parse((await call()).body);
    expect(body.text).toBe("groq answer");
    expect(body.provider).toBe("groq:openai/gpt-oss-120b");
    const groqCall = calls.find((c) => c.url.includes("groq.com"));
    expect(groqCall.init.headers.Authorization).toBe("Bearer groq-key");
    expect(groqCall.body.messages[0].role).toBe("system");
    expect(groqCall.body.reasoning_effort).toBe("low");
  });

  it("tries the second Groq model if the first Groq model fails", async () => {
    mockFetch([["generativelanguage", () => fail(500)], ["groq.com", (n, b) => (b.model === "openai/gpt-oss-120b" ? fail(429) : groqOk("small model"))]]);
    expect(JSON.parse((await call()).body).provider).toBe("groq:openai/gpt-oss-20b");
  });

  it("retries Gemini without thinkingConfig when the model rejects it", async () => {
    const calls = mockFetch([["generativelanguage", (n, b) => (b.generationConfig.thinkingConfig ? fail(400) : geminiOk("ok"))]]);
    const body = JSON.parse((await call()).body);
    expect(body.provider).toBe("gemini:gemini-3.8-flash");
    expect(calls).toHaveLength(2);
  });

  it("works with only a Groq key", async () => {
    delete process.env.GEMINI_API_KEY;
    const calls = mockFetch([["groq.com", () => groqOk("groq only")]]);
    expect(JSON.parse((await call()).body).text).toBe("groq only");
    expect(calls.every((c) => c.url.includes("groq.com"))).toBe(true);
  });

  it("treats an empty Gemini reply as a failure and moves on", async () => {
    mockFetch([["generativelanguage", () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }) })], ["groq.com", () => groqOk("fallback")]]);
    expect(JSON.parse((await call()).body).provider).toMatch(/^groq:/);
  });

  it("returns a friendly message when every provider fails", async () => {
    mockFetch([["generativelanguage", () => fail(500)], ["groq.com", () => fail(500)]]);
    const r = await call();
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).text).toMatch(/temporarily unavailable/);
  });

  it("honours model overrides from the environment", async () => {
    process.env.GEMINI_MODEL = "gemini-9-test";
    const calls = mockFetch([["generativelanguage", () => geminiOk("x")]]);
    await call();
    expect(calls[0].url).toContain("models/gemini-9-test:generateContent");
  });

  it("sends prior turns in the right roles for each provider", async () => {
    const turns = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }];
    const calls = mockFetch([["generativelanguage", () => geminiOk("x")]]);
    await call({ question: "next?", digest: "d", priorTurns: turns });
    expect(calls[0].body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });
});

describe("advisor guards", () => {
  it("is 'not set up' without any provider key", async () => {
    delete process.env.GEMINI_API_KEY; delete process.env.GROQ_API_KEY;
    mockFetch([]);
    const r = await call();
    expect(JSON.parse(r.body).text).toMatch(/isn't set up/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects requests from other websites", async () => {
    mockFetch([]);
    expect((await call(undefined, { origin: "https://evil.example" })).statusCode).toBe(403);
  });
});
