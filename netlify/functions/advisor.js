// Netlify Function — the only place ANTHROPIC_API_KEY is ever read.
// The client never talks to api.anthropic.com directly; it posts here,
// and this function does the real call server-side.
//
// Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
// Without it, this function responds with a friendly "not configured"
// message instead of a raw error, and the Advisor falls back to
// rule-based-only answers for anything the rule engine can't cover.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        text: "The AI assistant isn't set up yet — ask the shop owner to add an ANTHROPIC_API_KEY in the site's settings. Everyday questions still work without it.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { digest, priorTurns, question } = payload;
  if (!question || typeof question !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing question" }) };
  }

  const safeDigest = typeof digest === "string" ? digest.slice(0, 8000) : "";
  const safePriorTurns = Array.isArray(priorTurns)
    ? priorTurns.slice(-6).map((m) => ({
        role: m && m.role === "user" ? "user" : "assistant",
        content: String((m && m.content) || "").slice(0, 2000),
      }))
    : [];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content:
              `You are the AI Advisor inside ProfitMind, used by small shop owners in Uganda. ` +
              `Only use figures from this digest — never invent a number. If something isn't in the digest, say so plainly. ` +
              `Items in the digest may carry a [reason: ...] tag — that is the exact, pre-computed explanation for why something was flagged. ` +
              `If asked "why" about something, restate that reason (in your own words is fine, but never a different justification, and never invent one for something with no [reason] tag). ` +
              `Keep answers to 2-4 short sentences.\n\nDigest:\n${safeDigest}`,
          },
          { role: "assistant", content: "Understood — I'll answer using only this shop's real numbers." },
          ...safePriorTurns,
          { role: "user", content: question.slice(0, 2000) },
        ],
      }),
    });

    if (!res.ok) {
      return { statusCode: 200, body: JSON.stringify({ text: "The AI assistant is temporarily unavailable — try again in a moment." }) };
    }

    const data = await res.json();
    const text = (data.content || []).find((c) => c.type === "text")?.text?.trim() || "I couldn't work out an answer to that.";
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ text: "Couldn't reach the AI assistant just now — try again in a moment." }) };
  }
};
