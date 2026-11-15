// src/main.ts
import { TraceCanvas, StrokeData } from './ui/canvas-trace';

interface DictationToken {
  char: string;
  isPunctuation: boolean;
  revealed: boolean;
}

function initApp() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  const synth = window.speechSynthesis;
  const traceCanvas = new TraceCanvas('trace-canvas', 'ink-canvas', 'stroke-badge');

  const inputPassage = document.getElementById('input-passage') as HTMLInputElement;
  const btnStart = document.getElementById('btn-start-dictation') as HTMLButtonElement;
  const btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
  const btnSpeakChar = document.getElementById('btn-speak-char') as HTMLButtonElement;
  const slotsContainer = document.getElementById('sentence-slots') as HTMLElement;
  const feedbackBanner = document.getElementById('feedback-banner') as HTMLElement;

  const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
  const btnSkip = document.getElementById('btn-skip') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

  let tokens: DictationToken[] = [];
  let currentIndex = 0;
  let fullPassageText = '';

  const speakCantonese = (text: string) => {
    if (!text || !synth) return;
    if (synth.speaking) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-HK';
    utterance.rate = 0.85;
    const voices = synth.getVoices();
    const hkVoice = voices.find(v => /yue|cantonese|hong kong|zh-hk|粵|廣東/i.test(v.name + ' ' + v.lang));
    if (hkVoice) utterance.voice = hkVoice;
    synth.speak(utterance);
  };

  const showBanner = (msg: string, isError = false) => {
    feedbackBanner.textContent = msg;
    feedbackBanner.style.display = 'block';
    feedbackBanner.classList.toggle('warning-error', isError);
    window.setTimeout(() => { feedbackBanner.style.display = 'none'; }, 2200);
  };

  const renderSlots = () => {
    slotsContainer.innerHTML = '';
    tokens.forEach((token, idx) => {
      const div = document.createElement('div');
      div.className = 'char-slot';
      if (token.isPunctuation) {
        div.classList.add('punctuation');
        div.textContent = token.char;
      } else if (token.revealed) {
        div.classList.add('revealed');
        div.textContent = token.char;
      } else if (idx === currentIndex) {
        div.classList.add('active');
        div.textContent = '✍️';
      }
      slotsContainer.appendChild(div);
    });
  };

  const loadCurrentTarget = async () => {
    // 自動跳過標點符號
    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    renderSlots();

    if (currentIndex >= tokens.length) {
      traceCanvas.clearData();
      showBanner('🎉 叻仔！成段默書全部完成啦！');
      speakCantonese('好叻呀！全部寫啱晒！');
      return;
    }

    const targetChar = tokens[currentIndex].char;
    const unicode = targetChar.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    const baseUrl = import.meta.env.BASE_URL || '/';

    try {
      const res = await fetch(`${baseUrl}data/${unicode}.json`);
      if (!res.ok) throw new Error('字庫未收錄');
      const data: StrokeData = await res.json();
      traceCanvas.loadDictationTarget(data);
    } catch {
      // 若遇到極冷門字不在字庫，建立最小佔位資料讓小朋友照寫
      traceCanvas.loadDictationTarget({
        char: targetChar,
        unicode,
        totalStrokes: 4,
        strokes: []
      });
    }
  };

  // 寫對一隻字時觸發：彈出該字並進入下一字
  const handleCharacterSuccess = () => {
    tokens[currentIndex].revealed = true;
    showBanner(`✨ 寫啱咗「${tokens[currentIndex].char}」字！`);
    currentIndex++;
    loadCurrentTarget();
  };

  const handleCharacterFail = () => {
    showBanner('差少少，再試下或者按「重寫本字」啦！', true);
    window.setTimeout(() => traceCanvas.clearInk(), 900);
  };

  traceCanvas.setDictationCallbacks(handleCharacterSuccess, handleCharacterFail);

  const startDictation = () => {
    const raw = inputPassage.value.trim();
    if (!raw) return;
    fullPassageText = raw;

    // 儲存最後一次課文至本地，方便下次打開直接溫習
    localStorage.setItem('kidsprep_last_passage', raw);

    const punctRegex = /[，。！？、；：「」『』（）\s,.!?;:'"()]/;
    tokens = Array.from(raw).map(ch => ({
      char: ch,
      isPunctuation: punctRegex.test(ch),
      revealed: punctRegex.test(ch)
    }));

    currentIndex = 0;
    loadCurrentTarget();
    speakCantonese(fullPassageText);
  };

  btnStart.addEventListener('click', startDictation);
  btnSpeakSentence.addEventListener('click', () => speakCantonese(fullPassageText));
  btnSpeakChar.addEventListener('click', () => {
    if (currentIndex < tokens.length) speakCantonese(tokens[currentIndex].char);
  });
  btnHint.addEventListener('click', () => traceCanvas.flashHint(1800));
  btnClear.addEventListener('click', () => traceCanvas.clearInk());
  btnSkip.addEventListener('click', () => {
    if (currentIndex < tokens.length) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
      loadCurrentTarget();
    }
  });

  // 自動載入上次課文並啟動
  const saved = localStorage.getItem('kidsprep_last_passage');
  if (saved) inputPassage.value = saved;
  startDictation();
}

window.addEventListener('DOMContentLoaded', initApp);
