// Quiz Studio - HTML/CSS/JS (solo browser)
// Dati: questions.json
// Stato: in-memory + localStorage per "wrong list"

const els = {
  home: document.getElementById("screen-home"),
  quiz: document.getElementById("screen-quiz"),
  result: document.getElementById("screen-result"),

  inputCount: document.getElementById("input-count"),
  selectMode: document.getElementById("select-mode"),
  checkShuffle: document.getElementById("check-shuffle"),
  checkOnlyWrong: document.getElementById("check-only-wrong"),

  btnStart: document.getElementById("btn-start"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnRestart: document.getElementById("btn-restart"),
  btnRetryWrong: document.getElementById("btn-retry-wrong"),
  btnReset: document.getElementById("btn-reset"),
  btnEnd: document.getElementById("btn-end"),

  questionText: document.getElementById("question-text"),
  answers: document.getElementById("answers"),
  feedback: document.getElementById("feedback"),

  metaCounter: document.getElementById("meta-counter"),
  metaTopic: document.getElementById("meta-topic"),
  progressBar: document.getElementById("progress-bar"),

  resultSummary: document.getElementById("result-summary"),
  review: document.getElementById("review"),
};

const LS_WRONG = "quiz_studio_wrong_ids_v1";

let allQuestions = [];
let session = null;

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getWrongIds() {
  try {
    const raw = localStorage.getItem(LS_WRONG);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function setWrongIds(ids) {
  localStorage.setItem(LS_WRONG, JSON.stringify(ids));
}

function addWrongId(id) {
  const ids = new Set(getWrongIds());
  ids.add(id);
  setWrongIds([...ids]);
}

function removeWrongId(id) {
  const ids = new Set(getWrongIds());
  ids.delete(id);
  setWrongIds([...ids]);
}

function show(screen) {
  els.home.classList.add("hidden");
  els.quiz.classList.add("hidden");
  els.result.classList.add("hidden");
  screen.classList.remove("hidden");
}

function setTopic(topic) {
  if (!topic) {
    els.metaTopic.classList.add("hidden");
    els.metaTopic.textContent = "";
  } else {
    els.metaTopic.classList.remove("hidden");
    els.metaTopic.textContent = topic;
  }
}

function buildSession({ count, mode, shuffleAnswers, onlyWrong }) {
  let pool = [...allQuestions];

  if (onlyWrong) {
    const wrongIds = new Set(getWrongIds());
    const filtered = pool.filter((q) => wrongIds.has(q.id));
    if (filtered.length > 0) pool = filtered; // se vuoto, fallback al pool intero
  }

  pool = shuffle(pool);
  const picked = pool.slice(0, Math.min(count, pool.length));

  return {
    mode, // "instant" | "exam"
    shuffleAnswers,
    questions: picked,
    index: 0,
    answers: {}, // { [id]: { selectedOriginalIndex, isCorrect, mappedChoices } }
  };
}

function currentQuestion() {
  return session.questions[session.index];
}

function renderQuestion() {
  const q = currentQuestion();
  const total = session.questions.length;
  const pos = session.index + 1;

  els.metaCounter.textContent = `${pos}/${total}`;
  els.progressBar.style.width = `${Math.round((pos / total) * 100)}%`;

  setTopic(q.topic || "");

  els.questionText.textContent = q.question;
  els.answers.innerHTML = "";
  els.feedback.classList.add("hidden");
  els.feedback.textContent = "";

  // Build choice mapping (so we can shuffle without losing answerIndex meaning)
  let mapped = q.choices.map((text, originalIndex) => ({ text, originalIndex }));
  if (session.shuffleAnswers) mapped = shuffle(mapped);

  const prev = session.answers[q.id];
  if (prev?.mappedChoices) mapped = prev.mappedChoices;

  // Store mapping for consistency when navigating back
  if (!session.answers[q.id]) {
    session.answers[q.id] = {
      selectedOriginalIndex: null,
      isCorrect: null,
      mappedChoices: mapped,
    };
  } else {
    session.answers[q.id].mappedChoices = mapped;
  }

  const state = session.answers[q.id];
  const answered =
    state.selectedOriginalIndex !== null && state.selectedOriginalIndex !== undefined;

  mapped.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "answer";
    btn.type = "button";
    btn.textContent = c.text;

    // ✅ Permetti di cambiare risposta finché non premi "Avanti"
    btn.addEventListener("click", () => {
      selectAnswer(q, c.originalIndex);
    });

    els.answers.appendChild(btn);
  });

  els.btnPrev.disabled = session.index === 0;
  els.btnNext.disabled = !answered;

  // Se già risposto e stai tornando indietro, re-render markers
  if (answered) {
    if (session.mode === "instant") {
      applyAnswerStyles(q);
      renderFeedback(q);
    } else {
      applySelectedOnly(q);
    }
  }
}

function selectAnswer(q, selectedOriginalIndex) {
  const correct = selectedOriginalIndex === q.answerIndex;

  session.answers[q.id].selectedOriginalIndex = selectedOriginalIndex;
  session.answers[q.id].isCorrect = correct;

  // aggiorna wrong list persistente
  if (correct) removeWrongId(q.id);
  else addWrongId(q.id);

  // aggiorna UI (ogni click)
  if (session.mode === "instant") {
    applyAnswerStyles(q);
    renderFeedback(q);
  } else {
    applySelectedOnly(q);
  }

  els.btnNext.disabled = false;
}

function applySelectedOnly(q) {
  const state = session.answers[q.id];
  const mapped = state.mappedChoices;
  const buttons = [...els.answers.querySelectorAll(".answer")];

  buttons.forEach((btn) => {
    btn.classList.remove("correct", "wrong", "selected");
  });

  buttons.forEach((btn, mappedIndex) => {
    const originalIndex = mapped[mappedIndex].originalIndex;
    if (state.selectedOriginalIndex === originalIndex) {
      btn.classList.add("selected");
    }
  });
}

function applyAnswerStyles(q) {
  const state = session.answers[q.id];
  const mapped = state.mappedChoices;
  const buttons = [...els.answers.querySelectorAll(".answer")];

  // reset classi prima di rimetterle (così funziona anche quando cambi risposta)
  buttons.forEach((btn) => {
    btn.classList.remove("correct", "wrong", "selected");
  });

  buttons.forEach((btn, mappedIndex) => {
    const originalIndex = mapped[mappedIndex].originalIndex;

    if (originalIndex === q.answerIndex) btn.classList.add("correct");
    if (
      state.selectedOriginalIndex === originalIndex &&
      originalIndex !== q.answerIndex
    ) {
      btn.classList.add("wrong");
    }
    if (state.selectedOriginalIndex === originalIndex) {
      btn.classList.add("selected");
    }
  });
}

function renderFeedback(q) {
  const state = session.answers[q.id];
  els.feedback.classList.remove("hidden");
  els.feedback.classList.remove("good", "bad");
  els.feedback.innerHTML = "";

  const title = document.createElement("div");
  title.className = "title";

  if (state.isCorrect) {
    title.textContent = "✅ Corretto";
    els.feedback.classList.add("good");
  } else {
    title.textContent = "❌ Sbagliato";
    els.feedback.classList.add("bad");
  }

  els.feedback.appendChild(title);

  const exp = document.createElement("div");
  exp.className = "muted";
  exp.textContent = q.explanation ? q.explanation : "Nessuna spiegazione disponibile.";
  els.feedback.appendChild(exp);
}

function goNext() {
  if (session.index < session.questions.length - 1) {
    session.index += 1;
    renderQuestion();
  } else {
    renderResult();
  }
}

function goPrev() {
  if (session.index > 0) {
    session.index -= 1;
    renderQuestion();
  }
}

function renderResult() {
  show(els.result);

  const qs = session.questions;

  // Punteggio (gestisce sessione terminata prima)
  let correctCount = 0;
  let answeredCount = 0;

  qs.forEach((q) => {
    const a = session.answers[q.id];
    const answered =
      a?.selectedOriginalIndex !== null && a?.selectedOriginalIndex !== undefined;
    if (answered) {
      answeredCount += 1;
      if (a.isCorrect) correctCount += 1;
    }
  });

  const total = qs.length;
  const pctAnswered = answeredCount
    ? Math.round((correctCount / answeredCount) * 100)
    : 0;
  const unanswered = total - answeredCount;

  els.resultSummary.textContent = `Corrette: ${correctCount}/${answeredCount} (${pctAnswered}%) — Non risposte: ${unanswered}/${total}.`;

  // Pulsante "Ripeti sbagliate" solo se ne hai
  const wrong = qs.filter((q) => session.answers[q.id]?.isCorrect === false);
  if (els.btnRetryWrong) {
    if (wrong.length > 0) els.btnRetryWrong.classList.remove("hidden");
    else els.btnRetryWrong.classList.add("hidden");
  }

  // Review (lista completa)
  els.review.innerHTML = "";

  qs.forEach((q, i) => {
    const state = session.answers[q.id] ?? {
      selectedOriginalIndex: null,
      isCorrect: null,
      mappedChoices: null,
    };

    const div = document.createElement("div");
    div.className = "review-item";

    const qEl = document.createElement("div");
    qEl.className = "q";
    qEl.textContent = `${i + 1}. ${q.question}`;
    div.appendChild(qEl);

    const row = document.createElement("div");
    row.className = "row";

    const tag1 = document.createElement("span");
    tag1.className = "tag";
    tag1.textContent = q.topic ? `Topic: ${q.topic}` : "Topic: —";
    row.appendChild(tag1);

    const tag2 = document.createElement("span");
    const answered =
      state.selectedOriginalIndex !== null &&
      state.selectedOriginalIndex !== undefined;

    if (!answered) {
      tag2.className = "tag";
      tag2.textContent = "Non risposto";
    } else if (state.isCorrect) {
      tag2.className = "tag good";
      tag2.textContent = "Corretto";
    } else {
      tag2.className = "tag bad";
      tag2.textContent = "Sbagliato";
    }
    row.appendChild(tag2);

    div.appendChild(row);

    const your = document.createElement("div");
    your.className = "muted";
    const yourIdx = state.selectedOriginalIndex;
    const yourText =
      yourIdx === null || yourIdx === undefined ? "—" : q.choices[yourIdx];
    your.textContent = `Tua risposta: ${yourText}`;
    div.appendChild(your);

    const corr = document.createElement("div");
    corr.className = "muted";
    corr.textContent = `Corretta: ${q.choices[q.answerIndex]}`;
    div.appendChild(corr);

    if (q.explanation) {
      const exp = document.createElement("div");
      exp.className = "muted";
      exp.textContent = `Spiegazione: ${q.explanation}`;
      div.appendChild(exp);
    }

    els.review.appendChild(div);
  });
}

async function loadQuestions() {
  const res = await fetch("questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Impossibile caricare questions.json");
  const data = await res.json();

  if (!Array.isArray(data)) throw new Error("questions.json deve contenere un array");

  // Validazione minima
  data.forEach((q, idx) => {
    if (!q.id) q.id = `q_${idx + 1}`;
    if (!q.question || !Array.isArray(q.choices) || typeof q.answerIndex !== "number") {
      throw new Error(
        `Domanda non valida (indice ${idx}). Controlla question, choices, answerIndex.`
      );
    }
  });

  allQuestions = data;
}

function resetAll() {
  session = null;
  show(els.home);
}

function wireEvents() {
  els.btnStart.addEventListener("click", () => {
    const count = clampInt(els.inputCount.value, 1, 9999);
    const mode = els.selectMode.value; // "instant" | "exam"
    const shuffleAnswers = els.checkShuffle.checked;
    const onlyWrong = els.checkOnlyWrong.checked;

    session = buildSession({ count, mode, shuffleAnswers, onlyWrong });

    if (session.questions.length === 0) {
      alert("Non ci sono domande disponibili. Controlla questions.json.");
      return;
    }

    show(els.quiz);
    renderQuestion();
  });

  els.btnNext.addEventListener("click", goNext);
  els.btnPrev.addEventListener("click", goPrev);

  els.btnRestart.addEventListener("click", () => {
    show(els.home);
  });

  if (els.btnRetryWrong) {
    els.btnRetryWrong.addEventListener("click", () => {
      // avvia sessione ripeti sbagliate (usando wrongIds)
      els.checkOnlyWrong.checked = true;
      show(els.home);
    });
  }

  if (els.btnEnd) {
    els.btnEnd.addEventListener("click", () => {
      if (!session) return;

      const answeredCount = session.questions.filter((q) => {
        const a = session.answers[q.id];
        return a?.selectedOriginalIndex !== null && a?.selectedOriginalIndex !== undefined;
      }).length;

      const ok = confirm(
        `Terminare la sessione?\nRisposte date: ${answeredCount}/${session.questions.length}`
      );
      if (!ok) return;

      renderResult();
    });
  }

  els.btnReset.addEventListener("click", () => {
    setWrongIds([]);
    resetAll();
    alert("Reset completato: sessione e lista sbagliate azzerate.");
  });

  // Shortcuts tastiera
  window.addEventListener("keydown", (e) => {
    if (!session) return;
    if (els.quiz.classList.contains("hidden")) return;

    if (e.key === "ArrowRight" && !els.btnNext.disabled) goNext();
    if (e.key === "ArrowLeft" && !els.btnPrev.disabled) goPrev();
  });
}

(async function init() {
  try {
    wireEvents();
    await loadQuestions();
  } catch (err) {
    console.error(err);
    alert("Errore: " + err.message);
  }
})();
