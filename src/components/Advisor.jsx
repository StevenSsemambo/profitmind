/* ------------------------------------------------------------------ */
/* Advisor — everyday questions are answered instantly from the rule     */
/* engine (no network call); anything else is handed to Claude via a     */
/* Netlify Function so the API key never reaches the browser bundle.     */
/* See netlify/functions/advisor.js for the server side of this call.    */
/* ------------------------------------------------------------------ */
import { useState, useEffect, useRef } from "react";
import { Mic, Send, Volume2, VolumeX } from "lucide-react";
import { C } from "../lib/theme.js";
import { ruleBasedAnswer, buildDigest, offlineFallbackAnswer, SUGGESTIONS } from "../lib/advisorEngine.js";
import { Card, inputStyle } from "./ui/primitives.jsx";
import Briefing from "./Briefing.jsx";
import useVoice from "../hooks/useVoice.js";

export default function Advisor({ products, sales, debtors, purchases, onConfirmReorder }) {
  const [thread, setThread] = useState([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);
  const voice = useVoice();
  const prevThreadLen = useRef(0);

  // Speak each new AI reply aloud (if voice replies are on) — works the
  // same whether the reply came from a rule, the API, or a typed question.
  useEffect(() => {
    if (thread.length > prevThreadLen.current) {
      const last = thread[thread.length - 1];
      if (last && last.role === "ai" && voiceReplyEnabled) {
        voice.speak(last.text);
      }
    }
    prevThreadLen.current = thread.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  async function ask(q) {
    if (!q.trim()) return;
    setThread((t) => [...t, { role: "user", text: q }]);
    setQuestion("");
    setThinking(true);

    const ruleResult = ruleBasedAnswer(q, products, sales, debtors, purchases);
    if (ruleResult) {
      setThinking(false);
      setThread((t) => [...t, { role: "ai", ...ruleResult }]);
      return;
    }

    // No rule matched — ask Claude, grounded only in this shop's real numbers,
    // with a short window of prior turns so follow-up questions make sense.
    // The request goes to our own serverless function, not directly to
    // Anthropic — the API key lives server-side only (see the Netlify
    // Function), never in this client bundle.
    //
    // If the device is offline, or the call fails for any reason, this
    // never dead-ends: it falls back to a real snapshot built from the
    // shop's own data (offlineFallbackAnswer), so there's always a useful
    // answer even with zero connectivity.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setThinking(false);
      setThread((t) => [...t, { role: "ai", source: "offline", text: offlineFallbackAnswer(products, sales, debtors, purchases) }]);
      return;
    }

    try {
      const digest = buildDigest(products, sales, debtors, purchases);
      const priorTurns = thread.slice(-6).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
      const res = await fetch("/.netlify/functions/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest, priorTurns, question: q }),
      });
      if (!res.ok) throw new Error("advisor function error");
      const data = await res.json();
      const text = (data && data.text) || "I couldn't work out an answer to that.";
      setThread((t) => [...t, { role: "ai", source: "ai", text }]);
    } catch {
      setThread((t) => [...t, { role: "ai", source: "offline", text: offlineFallbackAnswer(products, sales, debtors, purchases) }]);
    } finally {
      setThinking(false);
    }
  }

  function handleMicPress() {
    if (voice.listening) {
      voice.stopListening();
      return;
    }
    voice.cancelSpeech();
    voice.startListening((finalText) => {
      setQuestion(finalText);
      ask(finalText);
    });
  }

  return (
    <div>
      <style>{`
        @keyframes pm-mic-pulse { 0% { box-shadow: 0 0 0 0 rgba(178,58,46,0.45); } 70% { box-shadow: 0 0 0 12px rgba(178,58,46,0); } 100% { box-shadow: 0 0 0 0 rgba(178,58,46,0); } }
        @keyframes pm-bar { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
      `}</style>
      <div className="flex items-start justify-between gap-3 mb-6">
        <p className="text-sm" style={{ color: C.ink, opacity: 0.6 }}>
          Everyday questions — sales, stock, debtors, prices, suppliers — are answered instantly from this shop's own data, even offline.
          Anything else is handed to Claude, grounded in the same numbers{voice.speechSupported ? " — or just talk to it." : "."}
        </p>
        {voice.synthSupported && (
          <button
            type="button"
            onClick={() => { setVoiceReplyEnabled((v) => !v); if (voiceReplyEnabled) voice.cancelSpeech(); }}
            className="shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border"
            style={{ borderColor: C.line, color: voiceReplyEnabled ? C.greenDark : C.ink, opacity: voiceReplyEnabled ? 1 : 0.45 }}
            title={voiceReplyEnabled ? "Voice replies on — tap to mute" : "Voice replies off — tap to unmute"}
          >
            {voiceReplyEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {voiceReplyEnabled ? "Voice on" : "Voice off"}
          </button>
        )}
      </div>
      <Briefing products={products} sales={sales} debtors={debtors} purchases={purchases} onConfirmReorder={onConfirmReorder} />
      <Card className="p-4 mb-4" style={{ minHeight: "160px" }}>
        {thread.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-xs px-3 py-1.5 rounded-full border"
                style={{ borderColor: C.line, color: C.ink }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {thread.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className="inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-line"
                style={m.role === "user" ? { background: C.navy, color: "white" } : { background: "white", border: `1px solid ${C.line}`, color: C.ink }}
              >
                {m.text}
              </div>
              {m.role === "ai" && m.source === "ai" && (
                <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: C.goldDark }}>AI-generated, from your data</p>
              )}
              {m.role === "ai" && m.source === "data" && (
                <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: C.ink, opacity: 0.3 }}>Direct from your records</p>
              )}
              {m.role === "ai" && m.source === "offline" && (
                <p className="text-[10px] uppercase tracking-wide mt-1" style={{ color: C.brick }}>AI assistant unreachable — snapshot from your records</p>
              )}
            </div>
          ))}
          {thinking && <p className="text-xs" style={{ color: C.ink, opacity: 0.4 }}>Checking your numbers…</p>}
          {voice.speaking && (
            <div className="flex items-center gap-2">
              <div className="flex items-end gap-0.5" style={{ height: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 3, height: "100%", borderRadius: 2, background: C.greenDark, transformOrigin: "bottom",
                      animation: `pm-bar 0.9s ease-in-out ${i * 0.12}s infinite`,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs" style={{ color: C.ink, opacity: 0.5 }}>Speaking…</span>
            </div>
          )}
        </div>
      </Card>
      {voice.listening && (
        <div className="mb-2 flex items-center gap-2 text-sm rounded-lg px-3 py-2" style={{ background: C.paperRaised, color: C.ink }}>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: C.brick }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: C.brick }} />
          </span>
          <span style={{ opacity: voice.interim ? 1 : 0.5 }}>{voice.interim || "Listening…"}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(question); } }}
          placeholder={voice.listening ? "Listening…" : "Ask about sales, profit, restocking, or anything else…"}
          style={inputStyle()}
        />
        {voice.speechSupported && (
          <button
            type="button"
            onClick={handleMicPress}
            className="shrink-0 rounded-lg p-2.5 transition-colors"
            style={{
              background: voice.listening ? C.brick : "white",
              border: `1px solid ${voice.listening ? C.brick : C.line}`,
              color: voice.listening ? "white" : C.ink,
              animation: voice.listening ? "pm-mic-pulse 1.6s ease-out infinite" : "none",
            }}
            title={voice.listening ? "Stop listening" : "Talk to your advisor"}
          >
            <Mic size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => ask(question)}
          disabled={!question.trim() || thinking}
          className="shrink-0 rounded-lg p-2.5 text-white disabled:opacity-40"
          style={{ background: C.greenDark }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
