(() => {
  // -----------------------------
  // Konfiguráció és adatok
  // -----------------------------
  const OPPONENT_NAMES = ["Dominik","Olivér","Levente","Marcell","Máté","Noel","Bence","Zalán","Ádám","Milán"];
  const GROUPS = ["középső csoportos", "nagycsoportos"];

  // Kezdő AI paraméterek
  const AI_BASE = {
    reactionSeconds: 1.25, // ennyi idő után "választ" az ellenfél (a kör indulásától számítva)
    accuracy: 0.70         // 70% eséllyel a helyes betűt választja
  };

  // Szintlépés: ha a gyerek nyer mérkőzést
  const AI_STEP = {
    reactionDelta: -0.25,  // gyorsabb lesz
    accuracyDelta: +0.05   // pontosabb lesz
  };

  const LIMITS = {
    minReaction: 0.45,
    maxAccuracy: 0.95
  };

  const CHAMP_MATCHES = 3;
  const MATCH_ROUNDS = 10;
  const CHILD_TIME_LIMIT_MS = 3000;

  // Betűk + emoji (könnyű, ismert szavak)
  // 5 betűt sorsolunk, mindegyikhez egy emoji, ami "A-val kezdődik" jellegű asszociációt ad.
  const LETTER_BANK = [
    { letter: "A", emoji: "🍎", word: "alma" },
    { letter: "B", emoji: "🍌", word: "banán" },
    { letter: "C", emoji: "🐱", word: "cica" },
    { letter: "D", emoji: "🦕", word: "dínó" },
    { letter: "E", emoji: "🐘", word: "elefánt" },
    { letter: "F", emoji: "🌳", word: "fa" },
    { letter: "G", emoji: "🍄", word: "gomba" },
    { letter: "H", emoji: "🐟", word: "hal" },
    { letter: "I", emoji: "⛸️", word: "jég" },     // közelítő asszociáció (I betű ritkább)
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
  // Stabil TTS (queue + watchdog)
  // -----------------------------
  const TTS = (() => {
    const hasTTS = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
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

    function startWatchdog(text){
      stopWatchdog();
      watchdog = setTimeout(() => {
        try{ window.speechSynthesis.cancel(); }catch(_){}
        speaking = false;
        queue.unshift(text);
        setTimeout(drain, 120);
      }, 6500);
    }

    function drain(){
      if (!hasTTS) return;
      if (speaking) return;
      if (!queue.length) return;

      const text = queue.shift();
      if (!text) return;

      speaking = true;

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "hu-HU";
      u.rate = 0.92;
      u.pitch = 1.0;
      if (voiceHU) u.voice = voiceHU;

      u.onend = () => {
        stopWatchdog();
        speaking = false;
        setTimeout(drain, 60);
      };
      u.onerror = () => {
        stopWatchdog();
        speaking = false;
        setTimeout(drain, 90);
      };

      startWatchdog(text);

      try { window.speechSynthesis.speak(u); }
      catch(_) {
        stopWatchdog();
        speaking = false;
      }
    }

    function say(text){
      lastText = text;
      if (!hasTTS) return;
      queue.push(text);
      setTimeout(drain, 40);
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

    return { say, repeat, hardStop, last: () => lastText };
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

    youMetaEl.textContent = `3 mp-ed van választani.`;
  }

  // -----------------------------
  // Állapotgép
  // -----------------------------
  const state = {
    phase: "idle", // idle | intro | countdown | playing | roundResult | matchEnd | champEnd
    level: 1,
    ai: { ...AI_BASE },

    champ: {
      matchIndex: 0,     // 0..3
      youMatchWins: 0,
      oppMatchWins: 0
    },

    match: {
      opponent: null,
      roundIndex: 0,     // 0..10
      youPoints: 0,
      oppPoints: 0
    },

    round: {
      letters: [],
      targetLetter: null,
      startedAt: 0,
      childPick: null,         // { letter, timeMs, correct }
      opponentPick: null,      // { letter, timeMs, correct }
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
    state.round = { letters: [], targetLetter: null, startedAt: 0, childPick: null, opponentPick: null, timers: [] };
  }

  function resetChamp(){
    state.phase = "idle";
    state.level = 1;
    state.ai = { ...AI_BASE };
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
    const txt = `Az ellenfeled ${opp.name}. ${opp.group}. Sok mérkőzést nyert már meg, le akar győzni téged.`;
    setHeader(`Az ellenfeled: ${opp.name} (${opp.group})`);
    setPrompt(txt);
    TTS.say(txt);
  }

  async function startMatch(){
    state.phase = "intro";
    resetMatch();
    state.champ.matchIndex += 1;
    state.match.opponent = pickOpponent();
    updateHud();

    speakOpponentIntro(state.match.opponent);

    // rövid szünet után countdown
    const t = setTimeout(() => startCountdown(), 1200);
    state.round.timers.push(t);
  }

  function startCountdown(){
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
    const picks = shuffle(LETTER_BANK).slice(0, 5);
    return picks;
  }

  function startRound(){
    clearTimers();
    state.phase = "playing";
    state.match.roundIndex += 1;

    // build UI letters
    state.round.letters = buildRoundLetters();
    state.round.targetLetter = pickRandom(state.round.letters).letter;

    renderLetters(state.round.letters);

    // announce task
    const taskTxt = `Válaszd ki az ${state.round.targetLetter} betűt.`;
    setHeader(`Kör ${state.match.roundIndex} / ${MATCH_ROUNDS}`);
    setPrompt(taskTxt);
    setStatus("", "Koppints gyorsan a helyes betűre!");
    updateHud();

    // round timing
    state.round.startedAt = performance.now();
    state.round.childPick = null;
    state.round.opponentPick = null;

    TTS.say(taskTxt);

    // Child timeout (3s): ha addig nincs helyes, akkor ellenfél döntése dönt
    const childDeadline = setTimeout(() => {
      // ha nincs még végeredmény, ellenfél döntése után zárunk, vagy azonnal, ha már megvolt
      // itt csak jelöljük, hogy lejárt
      if (state.phase === "playing"){
        setStatus("", "Lejárt az idő!");
        // (nem zárjuk azonnal, mert az ellenfél választása 1.25s körül jön)
      }
    }, CHILD_TIME_LIMIT_MS);
    state.round.timers.push(childDeadline);

    // Opponent decision
    const oppDecision = setTimeout(() => {
      if (state.phase !== "playing") return;
      makeOpponentPickAndResolve();
    }, Math.max(LIMITS.minReaction, state.ai.reactionSeconds) * 1000);
    state.round.timers.push(oppDecision);

    // Safety: ha valamiért elcsúszik, 3.2s-nál zárjunk mindenképp
    const hardEnd = setTimeout(() => {
      if (state.phase === "playing"){
        makeOpponentPickAndResolve(true);
      }
    }, 3200);
    state.round.timers.push(hardEnd);
  }

  function onChildPick(letter){
    if (state.phase !== "playing") return;

    const now = performance.now();
    const timeMs = now - state.round.startedAt;
    const correct = (letter === state.round.targetLetter);

    // csak az első kattintás számít
    if (state.round.childPick) return;

    state.round.childPick = { letter, timeMs, correct };

    // Ha helyes és az ellenfél még nem nyert (vagy még nincs döntése), azonnal nyerhet
    // A szabályod szerint: "Ha a kisfiam előbb találja el azt mondja ‘te nyertél’".
    // Tehát ha helyes, azonnal lezárjuk győzelemként.
    if (correct){
      resolveRound("you", `Te nyertél!`);
      return;
    }

    // Ha rossz, akkor még az ellenfél dönthet (ha még nem döntött).
    // Nem zárjuk azonnal, mert a leírás szerint az ellenfél választ 3s után is,
    // de a rossz választásnál gyakorlatilag az ellenfélnek könnyebb.
    setStatus("bad", "Nem jó. Próbálj gyorsabban!");
    TTS.say("Nem jó.");
  }

  function makeOpponentPickAndResolve(force = false){
    if (state.phase !== "playing") return;

    const now = performance.now();
    const timeMs = now - state.round.startedAt;

    // Ha már van ellenfél pick, ne ismételjük
    if (state.round.opponentPick) return;

    const willBeCorrect = Math.random() < state.ai.accuracy;

    let chosenLetter;
    if (willBeCorrect){
      chosenLetter = state.round.targetLetter;
    } else {
      // válasszon rosszat a felkínált 5 közül
      const others = state.round.letters.map(x => x.letter).filter(x => x !== state.round.targetLetter);
      chosenLetter = pickRandom(others);
    }

    state.round.opponentPick = { letter: chosenLetter, timeMs, correct: willBeCorrect };

    // Döntés: ha a gyerek már korábban helyeset választott volna, az már lezárta.
    // Ha nincs gyerek-győzelem, akkor az ellenfél nyer (ahogy kérted).
    const oppName = state.match.opponent.name;
    resolveRound("opp", `${oppName} nyert!`);
  }

  function resolveRound(winner, announceText){
    if (state.phase !== "playing") return;

    state.phase = "roundResult";
    clearTimers();

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

    // Következő kör / mérkőzés vége
    const t = setTimeout(() => {
      if (state.match.roundIndex >= MATCH_ROUNDS){
        endMatch();
      } else {
        startCountdown();
      }
    }, 850);
    state.round.timers.push(t);
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

      // szintlépés: ellenfél gyorsabb és pontosabb
      state.level += 1;
      state.ai.reactionSeconds = Math.max(LIMITS.minReaction, state.ai.reactionSeconds + AI_STEP.reactionDelta);
      state.ai.accuracy = Math.min(LIMITS.maxAccuracy, state.ai.accuracy + AI_STEP.accuracyDelta);
    } else {
      state.champ.oppMatchWins += 1;
      setHeader("Mérkőzés vége");
      setPrompt(`Most az ellenfeled nyert: ${oppName}.`);
      setStatus("bad", `Most az ellenfeled nyert: ${oppName}.`);
      TTS.say(`Most az ellenfeled nyert: ${oppName}.`);
      // nincs szintlépés
    }

    updateHud();

    const t = setTimeout(() => {
      if (state.champ.matchIndex >= CHAMP_MATCHES){
        endChampionship();
      } else {
        // következő mérkőzéshez újra "ready" kell
        state.phase = "idle";
        state.match.opponent = null;
        resetMatch();
        setHeader("Koppints a ✅ gombra a következő mérkőzéshez.");
        setPrompt("Ha készen állsz, indítsd a következő mérkőzést.");
        setStatus("", "Készen áll.");
        updateHud();
      }
    }, 1200);
    state.round.timers.push(t);
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

    // Újrakezdéshez ready
    const t = setTimeout(() => {
      state.phase = "idle";
      setHeader("Koppints a ✅ gombra, ha új bajnokságot szeretnél.");
      setPrompt("Új bajnoksághoz koppints a ✅ gombra.");
      setStatus("", "Készen áll.");
    }, 1200);
    state.round.timers.push(t);
  }

  // -----------------------------
  // Események
  // -----------------------------
  btnReady.addEventListener("click", () => {
    // Új bajnokság, ha már lezárult (champEnd) vagy még nem indult (matchIndex=0 és idle)
    // Egyszerűsítés: ha champIndex==0 és idle => startMatch
    // Ha champEnd után kattint => teljes reset és startMatch
    if (state.phase === "playing" || state.phase === "countdown" || state.phase === "intro" || state.phase === "roundResult" || state.phase === "matchEnd") return;

    if (state.phase === "champEnd"){
      // teljes reset
      resetChamp();
    }

    // Ha még nem indult a bajnokság (0/3), vagy folyamatban van de idle (következő mérkőzés előtt)
    if (state.phase === "idle"){
      if (state.champ.matchIndex === 0){
        // új bajnokság indul (számlálókat tisztán hagyjuk resetChamp után)
        // ha nem volt reset, akkor is új bajnokság esetén nullázzunk
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
