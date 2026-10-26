/* ------------------------------------------------------------------ */
/* useVoice — thin wrapper around the browser's SpeechRecognition and    */
/* speechSynthesis APIs, feature-detected so it degrades gracefully on   */
/* browsers/devices that don't support one or either.                    */
/* ------------------------------------------------------------------ */
import { useState, useRef } from "react";

export default function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef(null);

  const SpeechRecognitionAPI =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const speechSupported = !!SpeechRecognitionAPI;
  const synthSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  function startListening(onFinalResult) {
    if (!speechSupported || recognitionRef.current) return;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) onFinalResult(finalText.trim());
    };
    recognition.onend = () => { setListening(false); setInterim(""); recognitionRef.current = null; };
    recognition.onerror = () => { setListening(false); setInterim(""); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { setListening(false); }
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  function speak(text) {
    if (!synthSupported || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.03;
    utter.pitch = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en/i.test(v.lang) && /Natural|Google/i.test(v.name)) ||
      voices.find((v) => /en-GB|en-US/i.test(v.lang)) ||
      voices.find((v) => /en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }

  function cancelSpeech() {
    if (synthSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return { listening, speaking, interim, speechSupported, synthSupported, startListening, stopListening, speak, cancelSpeech };
}


