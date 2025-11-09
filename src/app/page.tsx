"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Volume2, BookOpen, Trophy, HelpCircle, Play, Pause, Upload, Download } from "lucide-react";

// =========================
// POC CONFIG (Single Problem) — now with basic i18n (EN/HI)
// =========================
// Problem statement: Grade 2 — Place Value up to 1000
// End-to-end POC includes: lesson + practice + AI-ish explainer/hints + gamification + local persistence + export/import

// --- Seed dataset (minimal) ---
const CONCEPT = {
  id: "M-G2-BASE10-PLACEVALUE",
  title: "Place Value up to 1000",
  grade: 2,
  subject: "Math",
  learning_objectives: [
    "Identify hundreds, tens, ones in any 3-digit number",
    "Compose & decompose numbers using base-10 understanding",
  ],
  real_world_hooks: [
    { hook: "Rupee notes & coins as hundreds/tens/ones" },
    { hook: "LEGO bricks: stacks of 10 and flats of 100" },
  ],
  misconceptions: [
    "Thinking 105 > 96 because 5>6 (ignoring place)",
    "Confusing '0' in tens place as 'no tens exist' so number becomes 1-digit",
  ],
};

// Item bank: graded difficulty 1→3
const ITEMS: Array<{
  id: string;
  type: "mcq" | "input" | "decompose";
  stem_i18n: { en: string; hi: string };
  answer: string;
  choices_i18n?: { en: string[]; hi: string[] };
  difficulty: 1 | 2 | 3;
}> = [
  {
    id: "q1",
    type: "mcq",
    stem_i18n: {
      en: "Which digit is in the hundreds place in 346?",
      hi: "346 में सैकड़ों (hundreds) स्थान पर कौन‑सा अंक है?",
    },
    choices_i18n: { en: ["3", "4", "6"], hi: ["3", "4", "6"] },
    answer: "3",
    difficulty: 1,
  },
  {
    id: "q2",
    type: "mcq",
    stem_i18n: {
      en: "Which number is greater?",
      hi: "कौन‑सा संख्या बड़ी है?",
    },
    choices_i18n: { en: ["507", "570"], hi: ["507", "570"] },
    answer: "570",
    difficulty: 1,
  },
  {
    id: "q3",
    type: "decompose",
    stem_i18n: {
      en: "Expand 408 as hundreds + tens + ones (format: H+T+O)",
      hi: "408 को सैकड़े + दहाई + इकाई के रूप में लिखें (H+T+O)",
    },
    answer: "400+0+8",
    difficulty: 2,
  },
  {
    id: "q4",
    type: "input",
    stem_i18n: {
      en: "Write the number with 5 hundreds, 2 tens, and 7 ones",
      hi: "5 सैकड़े, 2 दहाइयाँ और 7 इकाइयाँ मिलाकर संख्या लिखें",
    },
    answer: "527",
    difficulty: 2,
  },
  {
    id: "q5",
    type: "input",
    stem_i18n: {
      en: "If tens digit is 0 in 406, what is the value of tens? (enter a number)",
      hi: "406 में दहाई का अंक 0 है, दहाई का मान क्या होगा? (संख्या लिखें)",
    },
    answer: "0",
    difficulty: 3,
  },
  {
    id: "q6",
    type: "mcq",
    stem_i18n: {
      en: "Choose the correct comparison:",
      hi: "सही तुलना चुनें:",
    },
    choices_i18n: { en: ["405 < 450", "405 > 450"], hi: ["405 < 450", "405 > 450"] },
    answer: "405 < 450",
    difficulty: 3,
  },
];

// Gamification parameters
const POINTS_CORRECT = 10;
const POINTS_STREAK_BONUS = 5;
const HINT_PENALTY = 3; // subtract points if hint used

// Local storage keys
const LS_KEY = "poc_placevalue_progress_v1";
const LS_LANG = "poc_lang_v1" as const;

type Lang = "en" | "hi";

// Simple ELO-like difficulty steering (POC):
function chooseNextItem(history: Attempt[]): string {
  // target ~70% accuracy
  const last5 = history.slice(-5);
  const acc = last5.length
    ? last5.filter((h) => h.correct).length / last5.length
    : 0.7;
  const targetDifficulty: 1 | 2 | 3 = acc > 0.8 ? 3 : acc < 0.6 ? 1 : 2;
  const pool = ITEMS.filter((q) => q.difficulty === targetDifficulty);
  // pick least attempted among pool
  const counts: Record<string, number> = {};
  history.forEach((h) => {
    counts[h.item_id] = (counts[h.item_id] || 0) + 1;
  });
  const sorted = pool.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
  return (sorted[0] || ITEMS[0]).id;
}

// Attempt type
type Attempt = {
  item_id: string;
  response: string;
  correct: boolean;
  time_ms: number;
  hint_used?: boolean;
  ts: number;
};

// "AI-ish" explainer and hints (rule-based + templated with guardrails)
function generateExplainer(ageBand: "g1-2" | "g3-5", lang: Lang, numberExample = 346) {
  if (lang === "hi") {
    const age = ageBand === "g1-2" ? "कक्षा 1–2" : "কक्षा 3–5".replace("ক", "क"); // ensure Devanagari if copy issues
    return `(${age}) कल्पना करें कि हमारे पास रुपये की नोटें और सिक्के हैं। ${numberExample} में पहला अंक (3) सैकड़ों को दर्शाता है (₹100 की नोटें), दूसरा अंक (4) दहाइयों को (₹10 की नोटें) और आख़िरी अंक (6) इकाइयों को (₹1 के सिक्के)। इसलिए 346 = 3 सैकड़े + 4 दहाइयाँ + 6 इकाइयाँ।`;
  }
  const age = ageBand === "g1-2" ? "Grade 1–2" : "Grade 3–5";
  return `(${age}) Imagine rupee notes and coins. In ${numberExample}, the first digit (3) tells hundreds (₹100 notes), the second digit (4) tells tens (₹10 notes), and the last digit (6) tells ones (₹1 coins). So 346 = 3 hundreds + 4 tens + 6 ones.`;
}

function generateHint(item: (typeof ITEMS)[number], lastResponse?: string, lang: Lang = "en") {
  const H = (en: string, hi: string) => (lang === "hi" ? hi : en);
  switch (item.id) {
    case "q1":
      return H(
        "Look at the first digit from the left in a 3-digit number for hundreds.",
        "3-अंकों की संख्या में बाएँ से पहला अंक सैकड़ों को बताता है।"
      );
    case "q2":
      return H(
        "Compare the tens digit first. If they match, compare ones.",
        "पहले दहाई के अंक की तुलना करें। यदि बराबर हों तो इकाइयों की तुलना करें।"
      );
    case "q3":
      if (lastResponse && /\d+\+\d+\+\d+/.test(lastResponse)) {
        return H(
          "Check the tens part: the tens digit is 0 in 408.",
          "दहाई वाले भाग पर ध्यान दें: 408 में दहाई का अंक 0 है।"
        );
      }
      return H(
        "Write it as hundreds + tens + ones. How many tens in 408?",
        "इसे सैकड़ा + दहाई + इकाई के रूप में लिखें। 408 में कितनी दहाइयाँ हैं?"
      );
    case "q4":
      return H(
        "Five hundreds is 500, two tens is 20, seven ones is 7. Combine them.",
        "5 सैकड़े = 500, 2 दहाइयाँ = 20, 7 इकाइयाँ = 7; इन्हें जोड़ें।"
      );
    case "q5":
      return H(
        "A tens digit of 0 means zero tens (value 0).",
        "दहाई का अंक 0 होने का मतलब दहाई का मान 0 है।"
      );
    case "q6":
      return H(
        "Compare hundreds first: 4 vs 4 are equal. Now compare tens: 0 vs 5.",
        "पहले सैकड़े की तुलना करें: 4 और 4 समान हैं। अब दहाइयाँ देखें: 0 बनाम 5।"
      );
    default:
      return H(
        "Think about hundreds, tens, and ones.",
        "सैकड़ा, दहाई और इकाई के बारे में सोचें।"
      );
  }
}

function speak(text: string, lang: Lang = "en") {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.lang = lang === "hi" ? "hi-IN" : "en-IN";
  synth.speak(utter);
}

// Utility
function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// =========================
// Lightweight runtime tests (won't affect UI)
// =========================
(function selfTests() {
  try {
    const exEn = generateExplainer("g1-2", "en");
    const exHi = generateExplainer("g3-5", "hi");
    console.assert(typeof exEn === "string" && exEn.length > 10, "Explainer EN should be non-empty string");
    console.assert(typeof exHi === "string" && exHi.includes("₹"), "Explainer HI should mention rupee");

    const pick = chooseNextItem([
      { item_id: "q1", response: "3", correct: true, time_ms: 5000, ts: Date.now() },
      { item_id: "q2", response: "570", correct: true, time_ms: 4000, ts: Date.now() },
      { item_id: "q3", response: "400+0+8", correct: false, time_ms: 8000, ts: Date.now() },
    ]);
    console.assert(ITEMS.some(i => i.id === pick), "chooseNextItem should return a valid item id");

    const hint = generateHint(ITEMS[0], undefined, "en");
    console.assert(typeof hint === "string" && hint.length > 5, "Hint should be non-empty");
  } catch (e) {
    console.warn("POC self-tests warning:", e);
  }
})();

// =========================
// UI COMPONENT (Single File)
// =========================
export default function App() {
  const [tab, setTab] = useState("learn");
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem(LS_LANG) as Lang) || "hi";
    } catch {
      return "hi";
    }
  });
  const [ageBand, setAgeBand] = useState<"g1-2" | "g3-5">("g1-2");
  const [currentItemId, setCurrentItemId] = useState(ITEMS[0].id);
  const [inputValue, setInputValue] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as Attempt[]) : [];
    } catch {
      return [];
    }
  });
  const [points, setPoints] = useState(() =>
    attempts.reduce(
      (acc, a) => acc + (a.correct ? POINTS_CORRECT : 0) - (a.hint_used ? HINT_PENALTY : 0),
      0
    )
  );
  const [streak, setStreak] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(attempts));
  }, [attempts]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LANG, lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    // start timer when item changes
    startRef.current = performance.now();
  }, [currentItemId]);

  const currentItem = useMemo(
    () => ITEMS.find((q) => q.id === currentItemId)!,
    [currentItemId]
  );

  const accuracy = useMemo(() => {
    const total = attempts.length || 1;
    const correct = attempts.filter((a) => a.correct).length;
    return Math.round((correct / total) * 100);
  }, [attempts]);

  const completed = attempts.length;
  const target = 10; // POC goal
  const progress = Math.min(100, Math.round((completed / target) * 100));

  function submit() {
    const end = performance.now();
    const time_ms = startRef.current ? end - startRef.current : 0;
    const normalized = (inputValue || "").trim();
    const correct = normalized.toLowerCase() === currentItem.answer.toLowerCase();

    const att: Attempt = {
      item_id: currentItem.id,
      response: normalized,
      correct,
      time_ms,
      hint_used: hintUsed,
      ts: Date.now(),
    } as Attempt;
    setAttempts((prev) => [...prev, att]);

    let gained = correct ? POINTS_CORRECT : 0;
    let newStreak = streak;
    if (correct) {
      newStreak = streak + 1;
      if (newStreak > 0 && newStreak % 3 === 0) {
        gained += POINTS_STREAK_BONUS;
      }
    } else {
      newStreak = 0;
    }
    if (hintUsed) gained -= HINT_PENALTY;

    setPoints((p) => p + gained);
    setStreak(newStreak);
    setHintUsed(false);
    setInputValue("");

    // choose next
    const nextId = chooseNextItem([...attempts, att]);
    setCurrentItemId(nextId);
  }

  function onHint() {
    const hint = generateHint(currentItem, inputValue, lang);
    setHintUsed(true);
    alert((lang === "hi" ? "संकेत: " : "Hint: ") + hint);
  }

  function onSpeakExplainer() {
    speak(generateExplainer(ageBand, lang), lang);
  }

  function resetProgress() {
    setAttempts([]);
    setPoints(0);
    setStreak(0);
    setHintUsed(false);
    localStorage.removeItem(LS_KEY);
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify({ attempts, points }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "placevalue_progress.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProgress(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.attempts)) setAttempts(data.attempts);
        if (typeof data.points === "number") setPoints(data.points);
      } catch (e) {
        alert("Invalid progress file");
      }
    };
    reader.readAsText(file);
  }

  const last10 = attempts.slice(-10);
  const avgTime = last10.length
    ? Math.round(last10.reduce((s, a) => s + a.time_ms, 0) / last10.length)
    : 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="h-6 w-6" /> {lang === "hi" ? "हज़ार तक का स्थान‑मूल्य" : CONCEPT.title}
            </h1>
            <p className="text-sm text-slate-600">Grade {CONCEPT.grade} · {CONCEPT.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border rounded-md px-2 py-1 text-sm"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
            >
              <option value="hi">हिन्दी</option>
              <option value="en">English</option>
            </select>
            <Badge variant="secondary">{lang === "hi" ? "सटीकता" : "Accuracy"}: {accuracy}%</Badge>
            <Badge variant="secondary">{lang === "hi" ? "अंक" : "Points"}: {points}</Badge>
            <Badge variant="secondary">{lang === "hi" ? "लगातार सही" : "Streak"}: {streak}</Badge>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="learn">
              <BookOpen className="mr-2 h-4 w-4" /> Learn
            </TabsTrigger>
            <TabsTrigger value="practice">
              <Play className="mr-2 h-4 w-4" /> Practice
            </TabsTrigger>
            <TabsTrigger value="progress">
              <Trophy className="mr-2 h-4 w-4" /> Progress
            </TabsTrigger>
            <TabsTrigger value="parent">
              <HelpCircle className="mr-2 h-4 w-4" /> Parent
            </TabsTrigger>
          </TabsList>

          {/* Learn Tab */}
          <TabsContent value="learn" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium">{lang === "hi" ? "वास्तविक‑दुनिया से समझाना" : "Real‑world explainer"}</h2>
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded-md px-2 py-1 text-sm"
                      value={ageBand}
                      onChange={(e) => setAgeBand(e.target.value as any)}
                    >
                      <option value="g1-2">Grade 1–2</option>
                      <option value="g3-5">Grade 3–5</option>
                    </select>
                    <Button variant="secondary" onClick={onSpeakExplainer}>
                      <Volume2 className="h-4 w-4 mr-1" /> Read Aloud
                    </Button>
                  </div>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {generateExplainer(ageBand, lang)}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-amber-50 rounded-xl border">
                    <strong>Hooks:</strong>
                    <ul className="list-disc ml-5 text-sm text-slate-700">
                      {CONCEPT.real_world_hooks.map((h, i) => (
                        <li key={i}>{h.hook}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl border">
                    <strong>Objectives:</strong>
                    <ul className="list-disc ml-5 text-sm text-slate-700">
                      {CONCEPT.learning_objectives.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-sky-50 rounded-xl border">
                    <strong>Misconceptions:</strong>
                    <ul className="list-disc ml-5 text-sm text-slate-700">
                      {CONCEPT.misconceptions.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Practice Tab */}
          <TabsContent value="practice" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">{lang === "hi" ? "प्रश्न" : "Question"}</h2>
                  <Badge>Difficulty: {currentItem.difficulty}</Badge>
                </div>
                <p className="text-base">{currentItem.stem_i18n[lang]}</p>

                {currentItem.type === "mcq" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {currentItem.choices_i18n &&
                      currentItem.choices_i18n[lang].map((c) => (
                        <Button
                          key={c}
                          variant="outline"
                          onClick={() => setInputValue(c)}
                          className={inputValue === c ? "ring-2 ring-sky-400" : ""}
                        >
                          {c}
                        </Button>
                      ))}
                  </div>
                )}

                {(currentItem.type === "input" || currentItem.type === "decompose") && (
                  <Input
                    placeholder={
                      currentItem.type === "decompose"
                        ? lang === "hi"
                          ? "जैसे: 400+0+8"
                          : "e.g., 400+0+8"
                        : lang === "hi"
                        ? "अपना उत्तर लिखें"
                        : "Type your answer"
                    }
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                )}

                <div className="flex gap-2">
                  <Button onClick={submit} disabled={!inputValue}>
                    <Play className="h-4 w-4 mr-1" /> {lang === "hi" ? "जमा करें" : "Submit"}
                  </Button>
                  <Button variant="secondary" onClick={onHint}>
                    <HelpCircle className="h-4 w-4 mr-1" /> {lang === "hi" ? "संकेत" : "Hint"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="mt-4 space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">{lang === "hi" ? "अधिगम प्रगति" : "Mastery Progress"}</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={exportProgress}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                    <label className="inline-flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer">
                      <Upload className="h-4 w-4" />
                      <span className="text-sm">Import</span>
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => e.target.files && importProgress(e.target.files[0])}
                      />
                    </label>
                    <Button variant="destructive" onClick={resetProgress}>
                      Reset
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-2">
                    {lang === "hi" ? "प्रयास" : "Attempts"}: {attempts.length} · {lang === "hi" ? "औसत समय (अंतिम 10)" : "Avg time (last 10)"}: {formatTime(avgTime)}
                  </p>
                  <Progress value={progress} className="h-2" />
                  <p className="mt-2 text-xs text-slate-500">
                    {lang === "hi" ? `लक्ष्य: POC सत्र में ${target} प्रश्न` : `Target: ${target} questions in POC session`}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attempts
                    .slice(-6)
                    .reverse()
                    .map((a, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border ${a.correct ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}
                      >
                        <div className="text-sm">Q: {ITEMS.find((q) => q.id === a.item_id)?.stem_i18n[lang]}</div>
                        <div className="text-sm">
                          Your answer: <span className="font-medium">{a.response || "(blank)"}</span> · {a.correct ? "Correct" : "Incorrect"}
                        </div>
                        <div className="text-xs text-slate-600">Time: {formatTime(a.time_ms)} · Hint: {a.hint_used ? "Yes" : "No"}</div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parent Tab */}
          <TabsContent value="parent" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-6 space-y-4">
                <h2 className="text-lg font-medium mb-2">{lang === "hi" ? "अभिभावक दृश्य" : "Parent View"}</h2>
                <ul className="list-disc ml-6 text-slate-700 text-sm">
                  {lang === "hi" ? (
                    <>
                      <li>आज का लक्ष्य: 1000 तक का स्थान‑मूल्य। 10 प्रश्न, सटीकता 70%+ रखें।</li>
                      <li>टिप: घर पर ₹100/₹10/₹1 से संख्या बनवाएँ।</li>
                      <li>हर 3 सही उत्तर पर स्टिकर देकर उत्साह बढ़ाएँ।</li>
                    </>
                  ) : (
                    <>
                      <li>Today’s focus: Place value within 1000. Aim for 10 questions with 70%+ accuracy.</li>
                      <li>Tip: Use rupee notes/coins at home to build numbers (₹100/₹10/₹1).</li>
                      <li>Celebrate streaks every 3 correct answers—kids unlock a sticker!</li>
                    </>
                  )}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">Accuracy {accuracy}%</Badge>
                  <Badge variant="outline">Points {points}</Badge>
                  <Badge variant="outline">Streak {streak}</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
