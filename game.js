(() => {
  // -----------------------------
  // Konfiguráció és adatok
  // -----------------------------
  const OPPONENT_NAMES = ["Dominik","Olivér","Levente","Marcell","Máté","Noel","Bence","Zalán","Ádám","Milán"];
  const GROUPS = ["középső csoportos", "nagycsoportos"];

  // Kezdő AI paraméterek
  const AI_BASE = {
    reactionSeconds: 1.25, // a feladat elhangzása UTÁN ennyi idő múlva választ
    accuracy: 0.70
  };

  // Szintlépés: ha a gyerek nyer mérkőzést
  const AI_STEP = {
    reactionDelta: -0.25,
    accuracyDelta: +0.05
  };

  const LIMITS = {
    minReaction: 0.45,
    maxAccuracy: 0.95
  };

  const CHAMP_MATCHES = 3;
  const MATCH_ROUNDS = 10;

  // FONTOS: 6 mp, és csak a feladatmondat befejezése után indul
  const CHILD_TIME_LIMIT_MS = 6000;

  // Betűk + emoji
  const LETTER_BANK = [
    { letter: "A", emoji: "🍎", word: "alma" },
    { letter: "B", emoji: "🍌", word: "banán" },
    { letter: "C", emoji: "🐱", word: "cica" },
    { letter: "D", emoji: "🦕", word: "dínó" },
    { letter: "E", emoji: "🐘", word: "elefánt" },
    { letter: "F", emoji: "🌳", word: "fa" },
    { letter: "G", emoji: "🍄", word: "gomba" },
    { letter: "H", emoji: "🐟", word: "hal" },
    { letter: "I", emoji: "⛸️", word: "jég" },
    { letter: "J", emoji: "🍦", word: "jégkrém" },
    { letter: "K", emoji: "🐶", word: "kutya" },
    { letter: "L", emoji: "⚽", word: "labda" },
    { letter: "M", emoji: "🧸", word: "maci" },
    { letter: "N", emoji: "☀️", word: "nap" },
    { letter: "O", emoji: "🦁", word: "oroszlán" },
    { letter: "P", emoji: "🍕", word: "pizza" },
    { letter: "R", emoji: "🦊", word: "róka" },
    { letter: "S", emoji: "🦔", word: "süni" },
    { letter: "T", emoji: "🐢", word: "teknős" },
    { letter: "U", emoji: "🦄", word: "unikornis" },
    { letter: "V", emoji: "🚆", word: "vonat" },
    { letter: "Z", emoji: "🦓", word: "zebra" }
  ];

  // -----------------------------
  // DOM
  // -----------------------------
  const el = (id) => document.getElementById(id);

  const btnReady   = el("btnReady");
  const btnRepeat  = el("btnRepeat");
  const champInfo  = el("champInfo");
  const matchInfo  = el("matchInfo");
  const levelInfo  = el("levelInfo");
  const aiInfo     = el("aiInfo");

  const headline   = el("headline");
  const countdown  = el("countdown");
  const lettersEl  = el("letters");
  const promptEl   = el("prompt");
  const statusEl   = el("status");

  const youScoreEl = el("youScore");
  const oppScoreEl = el("oppScore");
  const oppNameEl  = el("oppName");
  const youMetaEl  = el("youMeta");
  const oppMetaEl  = el("oppMeta");

  // -----------------------------
  // Stabil TTS (queue + watchdog) + sayAsync
  // -----------------------------
  const TTS = (() => {
    const hasTTS = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
    /** @type {{text:string, resolve?: (ok:boolean)=>void}[]} */
    let queue = [];
    let speaking = false;
    let lastText = "";
    let voiceHU = null;
    let watchdog = null;

    function loadVoiceHU(){
      if (!hasTTS) return;
      const voices = window.speechSynthesis.getVoices?.() || [];
      voiceHU = voices.find(v => (v.lang || "").toLowerCase().startsWith("hu")) || null;
    }
    if (hasTTS){
      window.speechSynthesis.onvoiceschanged = () => loadVoiceHU();
      loadVoiceHU();
    }

    function stopWatchdog(){
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
    }

    function startWatchdog(item){
      stopWatchdog();
      watchdog = setTimeout(() => {
        try{ window.speechSynthesis.cancel(); }catch(_){}
        speaking = false;
        queue.unshift(item);
        setTimeout(drain, 120);
      }, 6500);
    }

    function drain(){
      if (!hasTTS) return;
      if (speaking) return;
      if (!queue.length) return;

      const item = queue.shift();
      if (!item || !item.text) return;

      speaking = true;

      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = "hu-HU";
      u.rate = 0.92;
      u.pitch = 1.0;
      if (voiceHU) u.voice = voiceHU;

      u.onend = () => {
        stopWatchdog();
        speaking = false;
        if (item.resolve) item.resolve(true);
        setTimeout(drain, 60);
      };
      u.onerror = () => {
        stopWatchdog();
        speaking = false;
        if (item.resolve) item.resolve(false);
        setTimeout(drain, 90);
      };

      startWatchdog(item);

      try { window.speechSynthesis.speak(u); }
      catch(_) {
        stopWatchdog();
        speaking = false;
        if (item.resolve) item.resolve(false);
      }
    }

    function say(text){
      lastText = text;
      if (!hasTTS) return;
      queue.push({ text });
      setTimeout(drain, 40);
    }

    function sayAsync(text){
      lastText = text;
      if (!hasTTS) return Promise.resolve(true);
      return new Promise((resolve) => {
        queue.push({ text, resolve });
        setTimeout(drain, 40);
      });
    }

    function repeat(){
      if (lastText) say(lastText);
    }

    function hardStop(){
      if (!hasTTS) return;
      queue = [];
      speaking = false;
      stopWatchdog();
      try{ window.speechSynthesis.cancel(); }catch(_){}
    }

    return { say, sayAsync, repeat, hardStop, last: () => lastText };
  })();

  // -----------------------------
  // Helper
  // -----------------------------
  const randInt = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
  const pickRandom = (arr) => arr[randInt(0, arr.length-1)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i=a.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function setStatus(type, text){
    statusEl.classList.remove("ok","bad");
    if (type) statusEl.classList.add(type);
    statusEl.textContent = text;
  }

  function setPrompt(text){
    promptEl.textContent = text;
  }

  function clearLetters(){
    lettersEl.innerHTML = "";
  }

  function renderLetters(items){
    clearLetters();
    for (const it of items){
      const b = document.createElement("div");
      b.className = "letterBtn";
      b.dataset.letter = it.letter;

      const em = document.createElement("div");
      em.className = "emoji";
      em.textContent = it.emoji;

      const lt = document.createElement("div");
      lt.className = "letter";
      lt.textContent = it.letter;

      b.appendChild(em);
      b.appendChild(lt);

      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        onChildPick(it.letter);
      }, { passive:false });

      lettersEl.appendChild(b);
    }
  }

  function setHeader(text){
    headline.textContent = text;
  }

  function updateHud(){
    champInfo.textContent = `Bajnokság: ${state.champ.matchIndex} / ${CHAMP_MATCHES}`;
    matchInfo.textContent = `Mérkőzés: ${state.match.roundIndex} / ${MATCH_ROUNDS}`;
    levelInfo.textContent = `Szint: ${state.level}`;
    aiInfo.textContent = state.match.opponent
      ? `Ellenfél: ${state.match.opponent.name}`
      : "Ellenfél: —";

    youScoreEl.textContent = String(state.match.youPoints);
    oppScoreEl.textContent = String(state.match.oppPoints);

    oppNameEl.textContent = state.match.opponent ? state.match.opponent.name : "Ellenfél";
    oppMetaEl.textContent = state.match.opponent
      ? `Sebesség: ${state.ai.reactionSeconds.toFixed(2)} mp | Pontosság: ${Math.round(state.ai.accuracy*100)}%`
      : `Sebesség: — | Pontosság: —`;

    youMetaEl.textContent = `6 mp-ed van választani.`;
  }

  // -----------------------------
  // Állapotgép
  // -----------------------------
  const state = {
    phase: "idle",
    level: 1,
    ai: { reactionSeconds: AI_BASE.reactionSeconds, accuracy: AI_BASE.accuracy },

    champ: {
      matchIndex: 0,
      youMatchWins: 0,
      oppMatchWins: 0
    },

    match: {
      opponent: null,
      roundIndex: 0,
      youPoints: 0,
      oppPoints: 0
    },

    round: {
      letters: [],
      targetLetter: null,
      startedAt: 0,
      canPick: false,           // csak a feladatmondat után engedjük a választást
      childPick: null,
      opponentPick: null,
      timers: []
    }
  };

  function clearTimers(){
    for (const t of state.round.timers){
      clearTimeout(t);
      clearInterval(t);
    }
    state.round.timers = [];
  }

  function resetMatch(){
    state.match.roundIndex = 0;
    state.match.youPoints = 0;
    state.match.oppPoints = 0;
    state.round = { letters: [], targetLetter: null, startedAt: 0, canPick: false, childPick: null, opponentPick: null, timers: [] };
  }

  function resetChamp(){
    state.phase = "idle";
    state.level = 1;
    state.ai = { reactionSeconds: AI_BASE.reactionSeconds, accuracy: AI_BASE.accuracy };
    state.champ.matchIndex = 0;
    state.champ.youMatchWins = 0;
    state.champ.oppMatchWins = 0;
    state.match.opponent = null;
    resetMatch();

    setHeader("Koppints a ✅ gombra a kezdéshez.");
    countdown.textContent = "";
    clearLetters();
    setPrompt("A feladat itt jelenik meg és hangosan is elhangzik.");
    setStatus("", "Készen áll.");
    updateHud();
  }

  // -----------------------------
  // Játéklogika
  // -----------------------------
  function pickOpponent(){
    const name = pickRandom(OPPONENT_NAMES);
    const group = pickRandom(GROUPS);
    return { name, group };
  }

  function speakOpponentIntro(opp){
    const txt = `Az ellenfeled ${opp.name}. ${opp.group}.
