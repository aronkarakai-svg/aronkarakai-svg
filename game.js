(() => {
  // -----------------------------
  // Konfiguráció és adatok
  // -----------------------------
  const OPPONENT_NAMES = ["Dominik","Olivér","Levente","Marcell","Máté","Noel","Bence","Zalán","Ádám","Milán"];
  const GROUPS = ["középső csoportos", "nagycsoportos"];

  const AI_BASE = { reactionSeconds: 1.25, accuracy: 0.70 };
  const AI_STEP = { reactionDelta: -0.25, accuracyDelta: +0.05 };
  const LIMITS = { minReaction: 0.45, maxAccuracy: 0.95 };

  const CHAMP_MATCHES = 3;
  const MATCH_ROUNDS = 10;

  // 6 mp – és csak a feladatmondat után indul
  const CHILD_TIME_LIMIT_MS = 6000;

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
  // Stabil TTS + sayAsync timeout-tal
  // -----------------------------
  const TTS = (() => {
    const hasTTS = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);

    let queue = []; // {text, resolve?, timeoutMs?}
    let speaking = false;
    let lastText = "";
    let voiceHU = null;

    function loadVoiceHU(){
      if (!hasTTS) return;
      const voices = window.speechSynthesis.getVoices?.() || [];
      voiceHU = voices.find(v => (v.lang || "").toLowerCase().startsWith("hu")) || null;
    }
    if (hasTTS){
      window.speechSynthesis.onvoiceschanged = () => loadVoiceHU();
      loadVoiceHU();
    }

    function hardStop(){
      if (!hasTTS) return;
      queue = [];
      speaking = false;
      try{ window.speechSynthesis.cancel(); }catch(_){}
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

      let finished = false;
      let fallbackTimer = null;

      const finish = (ok) => {
        if (finished) return;
        finished = true;
        speaking = false;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = null;
        if (item.resolve) item.resolve(ok);
        setTimeout(drain, 60);
      };

      // Kritikus: ha a böngésző nem küld onend-et, akkor is oldjuk fel.
      const timeoutMs = Math.max(800, item.timeoutMs || 3500);
      fallbackTimer = setTimeout(() => {
        // próbáljuk leállítani a beragadt beszédet, majd lépjünk tovább
        try{ window.speechSynthesis.cancel(); }catch(_){}
        finish(false);
      }, timeoutMs);

      u.onend = () => finish(true);
      u.onerror = () => finish(false);

      try{
        window.speechSynthesis.speak(u);
      } catch(_){
        try{ window.speechSynthesis.cancel(); }catch(__){}
        finish(false);
      }
    }

    function say(text){
      lastText = text;
      if (!hasTTS) return;
      queue.push({ text });
      setTimeout(drain, 20);
    }

    // timeoutMs: max várakozás; ha nincs onend, akkor is továbblépünk
    function sayAsync(text, timeoutMs = 3500){
      lastText = text;
      if (!hasTTS) return Promise.resolve(false);
      return new Promise((resolve) => {
        queue.push({ text, resolve, timeoutMs });
        setTimeout(drain, 20);
      });
    }

    function repeat(){
      if (lastText) say(lastText);
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

  function setPrompt(text){ promptEl.textContent = text; }
  function setHeader(text){ headline.textContent = text; }

  function clearLetters(){ lettersEl.innerHTML = ""; }

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

  function updateHud(){
    champInfo.textContent = `Bajnokság: ${state.champ.matchIndex} / ${CHAMP_MATCHES}`;
    matchInfo.textContent = `Mérkőzés: ${state.match.roundIndex} / ${MATCH_ROUNDS}`;
    levelInfo.textContent = `Szint: ${state.level}`;
    aiInfo.textContent = state.match.opponent ? `Ellenfél: ${state.match.opponent.name}` : "Ellenfél: —";

    youScoreEl.textContent = String(state.match.youPoints);
    oppScoreEl.textContent = String(state.match.oppPoints);

    oppNameEl.textContent = state.match.opponent ? state.match.opponent.name : "Ellenfél";
    oppMetaEl.textContent = state.match.opponent
      ? `Sebesség: ${state.ai.reactionSeconds.toFixed(2)} mp | Pontosság: ${Math.round(state.ai.accuracy*100)}%`
      : `Sebesség: — | Pontosság: —`;

    youMetaEl.textContent = `6 mp-ed van választani.`;
  }

  // -----------------------------
  // Állapot
  // -----------------------------
  const state = {
    phase: "idle",
    level: 1,
    ai: { reactionSeconds: AI_BASE.reactionSeconds, accuracy: AI_BASE.accuracy },

    champ: { matchIndex: 0, youMatchWins: 0, oppMatchWins: 0 },

    match: { opponent: null, roundIndex: 0, youPoints: 0, oppPoints: 0 },

    round: {
      letters: [],
      targetLetter: null,
      startedAt: 0,
      canPick: false,
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
    state.round = { letters: [], targetLetter: null, startedAt: 0, canPick: false, opponentPick: null, timers: [] };
  }

  function resetChamp(){
    clearTimers();
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
    return { name: pickRandom(OPPONENT_NAMES), group: pickRandom(GROUPS) };
  }

  async function startMatch(){
    clearTimers();
    TTS.hardStop(); // fontos: ha előző beszéd beragadt, itt takarítunk

    state.phase = "intro";
    resetMatch();
    state.champ.matchIndex += 1;
    state.match.opponent = pickOpponent();
    updateHud();

    const opp = state.match.opponent;
    const intro = `Az ellenfeled ${opp.name}. ${opp.group}. Sok mérkőzést nyert már meg, le akar győzni téged.`;

    setHeader(`Az ellenfeled: ${opp.name} (${opp.group})`);
    setPrompt(intro);
    setStatus("", "Bemutatkozás...");

    // Intro beszéd: max 7s-ig várunk, utána is továbblépünk
    await TTS.sayAsync(intro, 7000);

    if (state.phase !== "intro") return;
    startCountdown();
  }

  function startCountdown(){
    clearTimers();
    state.phase = "countdown";
    countdown.textContent = "";
    clearLetters();
    setStatus("", "Figyelj!");
    updateHud();

    const seq = ["3","2","1"];
    let i = 0;

    const tick = () => {
      if (i >= seq.length){
        countdown.textContent = "";
        startRound();
        return;
      }
      countdown.textContent = seq[i];
      TTS.say(seq[i]);
      i++;
      state.round.timers.push(setTimeout(tick, 650));
    };

    tick();
  }

  function buildRoundLetters(){
    return shuffle(LETTER_BANK).slice(0, 5);
  }

  async function startRound(){
    clearTimers();
    state.phase = "playing";
    state.match.roundIndex += 1;

    state.round.letters = buildRoundLetters();
    state.round.targetLetter = pickRandom(state.round.letters).letter;

    renderLetters(state.round.letters);

    const taskTxt = `Válaszd ki az ${state.round.targetLetter} betűt.`;
    setHeader(`Kör ${state.match.roundIndex} / ${MATCH_ROUNDS}`);
    setPrompt(taskTxt);
    setStatus("", "Hallgasd meg a feladatot, utána indul az idő!");
    updateHud();

    state.round.canPick = false;
    state.round.startedAt = 0;
    state.round.opponentPick = null;

    // Feladat beszéd: max 4.5s-ig várunk, ha beragad / nem indul, akkor is kezdünk
    await TTS.sayAsync(taskTxt, 4500);

    if (state.phase !== "playing") return;
    beginTimingAfterSpeech();
  }

  function beginTimingAfterSpeech(){
    state.round.canPick = true;
    state.round.startedAt = performance.now();

    setStatus("", "Most válassz! (6 mp)");
    updateHud();

    // 6 mp gyereknek
    state.round.timers.push(setTimeout(() => {
      if (state.phase === "playing"){
        setStatus("", "Lejárt az idő!");
      }
    }, CHILD_TIME_LIMIT_MS));

    // ellenfél reakció a beszéd után számítva
    state.round.timers.push(setTimeout(() => {
      if (state.phase !== "playing") return;
      makeOpponentPickAndResolve();
    }, Math.max(LIMITS.minReaction, state.ai.reactionSeconds) * 1000));

    // hard end: 6.2s
    state.round.timers.push(setTimeout(() => {
      if (state.phase === "playing"){
        makeOpponentPickAndResolve(true);
      }
    }, CHILD_TIME_LIMIT_MS + 200));
  }

  function onChildPick(letter){
    if (state.phase !== "playing") return;
    if (!state.round.canPick) return;

    const correct = (letter === state.round.targetLetter);
    if (correct){
      resolveRound("you");
      return;
    }

    setStatus("bad", "Nem jó. Próbáld újra gyorsan!");
    TTS.say("Nem jó.");
  }

  function makeOpponentPickAndResolve(){
    if (state.phase !== "playing") return;
    if (state.round.opponentPick) return;

    const willBeCorrect = Math.random() < state.ai.accuracy;
    state.round.opponentPick = { correct: willBeCorrect };

    // ha eddig nem nyert a gyerek, akkor az ellenfél viszi a kört (a te szabályod szerint)
    resolveRound("opp");
  }

  function resolveRound(winner){
    if (state.phase !== "playing") return;

    state.phase = "roundResult";
    clearTimers();
    state.round.canPick = false;

    if (winner === "you"){
      state.match.youPoints += 1;
      setStatus("ok", "Te nyertél!");
      TTS.say("Te nyertél.");
    } else {
      state.match.oppPoints += 1;
      const oppName = state.match.opponent.name;
      setStatus("bad", `${oppName} nyert!`);
      TTS.say(`${oppName} nyert.`);
    }

    updateHud();

    state.round.timers.push(setTimeout(() => {
      if (state.match.roundIndex >= MATCH_ROUNDS){
        endMatch();
      } else {
        startCountdown();
      }
    }, 850));
  }

  function endMatch(){
    state.phase = "matchEnd";
    clearTimers();
    clearLetters();
    countdown.textContent = "";

    const oppName = state.match.opponent.name;

    if (state.match.youPoints > state.match.oppPoints){
      state.champ.youMatchWins += 1;
      setHeader("Mérkőzés vége");
      setPrompt("Gratulálok, ezt te nyerted!");
      setStatus("ok", "Gratulálok, ezt te nyerted!");
      TTS.say("Gratulálok, ezt te nyerted!");

      state.level += 1;
      state.ai.reactionSeconds = Math.max(LIMITS.minReaction, state.ai.reactionSeconds + AI_STEP.reactionDelta);
      state.ai.accuracy = Math.min(LIMITS.maxAccuracy, state.ai.accuracy + AI_STEP.accuracyDelta);
    } else {
      state.champ.oppMatchWins += 1;
      setHeader("Mérkőzés vége");
      setPrompt(`Most az ellenfeled nyert: ${oppName}.`);
      setStatus("bad", `Most az ellenfeled nyert: ${oppName}.`);
      TTS.say(`Most az ellenfeled nyert: ${oppName}.`);
    }

    updateHud();

    state.round.timers.push(setTimeout(() => {
      if (state.champ.matchIndex >= CHAMP_MATCHES){
        endChampionship();
      } else {
        state.phase = "idle";
        state.match.opponent = null;
        resetMatch();
        setHeader("Koppints a ✅ gombra a következő mérkőzéshez.");
        setPrompt("Ha készen állsz, indítsd a következő mérkőzést.");
        setStatus("", "Készen áll.");
        updateHud();
      }
    }, 1200));
  }

  function endChampionship(){
    state.phase = "champEnd";
    clearTimers();
    clearLetters();
    countdown.textContent = "";

    const youWonAll = (state.champ.youMatchWins === CHAMP_MATCHES);

    if (youWonAll){
      setHeader("Bajnokság vége");
      setPrompt("Te vagy a bajnok!");
      setStatus("ok", "Te vagy a bajnok!");
      TTS.say("Te vagy a bajnok!");
    } else {
      setHeader("Bajnokság vége");
      setPrompt("Nem baj, majd legközelebb.");
      setStatus("", "Nem baj, majd legközelebb.");
      TTS.say("Nem baj, majd legközelebb.");
    }

    updateHud();

    state.round.timers.push(setTimeout(() => {
      state.phase = "idle";
      setHeader("Koppints a ✅ gombra, ha új bajnokságot szeretnél.");
      setPrompt("Új bajnoksághoz koppints a ✅ gombra.");
      setStatus("", "Készen áll.");
    }, 1200));
  }

  // -----------------------------
  // Események
  // -----------------------------
  btnReady.addEventListener("click", () => {
    // bármilyen beragadás esetén: egy új kattintás tisztít
    TTS.hardStop();

    if (["playing","countdown","intro","roundResult","matchEnd"].includes(state.phase)) return;

    if (state.phase === "champEnd"){
      resetChamp();
    }

    if (state.phase === "idle"){
      if (state.champ.matchIndex === 0){
        state.champ.youMatchWins = 0;
        state.champ.oppMatchWins = 0;
      }
      startMatch();
    }
  });

  btnRepeat.addEventListener("click", () => TTS.repeat());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) TTS.hardStop();
  });

  // -----------------------------
  // Init
  // -----------------------------
  resetChamp();
})();
