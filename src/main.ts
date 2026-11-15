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

  const parentPanel = document.getElementById('parent-panel') as HTMLDetailsElement;
  const inputPassage = document.getElementById('input-passage') as HTMLTextAreaElement;
  const btnStartPassage = document.getElementById('btn-start-passage') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.btn-preset');
  const progressPill = document.getElementById('progress-pill') as HTMLElement;

  const audioToolbar = document.getElementById('audio-toolbar') as HTMLElement;
  const btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
  const btnSpeakChar = document.getElementById('btn-speak-char') as HTMLButtonElement;
  const slotsContainer = document.getElementById('sentence-slots') as HTMLElement;
  const feedbackBanner = document.getElementById('feedback-banner') as HTMLElement;

  const btnConfirmWord = document.getElementById('btn-confirm-word') as HTMLButtonElement;
  const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

  let tokens: DictationToken[] = [];
  let currentIndex = 0;
  let fullPassageText = '';
  let isFreeCountMode = false;

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
    window.setTimeout(() => { feedbackBanner.style.display = 'none'; }, 2000);
  };

  const updateProgressBadge = () => {
    const totalChars = tokens.filter(t => !t.isPunctuation).length;
    const doneChars = tokens.filter(t => !t.isPunctuation && t.revealed).length;
    progressPill.textContent = isFreeCountMode
      ? `已寫 ${doneChars} / ${totalChars} 格`
      : `進度 ${doneChars} / ${totalChars} 字`;
  };

  const renderSlots = () => {
    slotsContainer.innerHTML = '';
    let activeEl: HTMLElement | null = null;

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
        activeEl = div;
      }
      slotsContainer.appendChild(div);
    });

    updateProgressBadge();

    // 自動平滑捲動到當前正在書寫的格仔，成段幾十字都唔會寫出界
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const loadCurrentTarget = async () => {
    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    // 自由格數模式下，如果寫滿現有格仔，自動再加多 10 格（成段默幾長都得）
    if (isFreeCountMode && currentIndex >= tokens.length) {
      const extra = Array.from({ length: 10 }, () => ({
        char: '✓',
        isPunctuation: false,
        revealed: false
      }));
      tokens.push(...extra);
      showBanner('✨ 已自動為你加多 10 個格仔，繼續寫！');
    }

    renderSlots();

    if (!isFreeCountMode && currentIndex >= tokens.length) {
      traceCanvas.clearData();
      showBanner('🎉 叻仔！成段默書全部完成啦！');
      speakCantonese('好叻呀！成段默書寫啱晒！');
      return;
    }

    if (isFreeCountMode) {
      traceCanvas.clearData();
      return;
    }

    const targetChar = tokens[currentIndex].char;
    const unicode = targetChar.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    const baseUrl = import.meta.env.BASE_URL || '/';

    try {
      const res = await fetch(`${baseUrl}data/${unicode}.json`);
      if (!res.ok) throw new Error('Not found');
      const data: StrokeData = await res.json();
      traceCanvas.loadDictationTarget(data);
    } catch {
      traceCanvas.loadDictationTarget({ char: targetChar, unicode, totalStrokes: 4, strokes: [] });
    }
  };

  const handleCharacterSuccess = () => {
    if (currentIndex >= tokens.length) return;
    tokens[currentIndex].revealed = true;
    showBanner(`✨ 寫啱咗「${tokens[currentIndex].char}」字！`);
    currentIndex++;
    loadCurrentTarget();
  };

  const handleCharacterFail = () => {
    if (isFreeCountMode) return;
    showBanner('差少少，再試下或者按「重寫」啦！', true);
    window.setTimeout(() => traceCanvas.clearInk(), 900);
  };

  traceCanvas.setDictationCallbacks(handleCharacterSuccess, handleCharacterFail);

  // 模式一：家長輸入整段課文 -> 立即清空輸入框並收起面板防偷睇
  const startPassageDictation = () => {
    const raw = inputPassage.value.trim();
    if (!raw) {
      showBanner('請先貼上默書課文！', true);
      return;
    }
    isFreeCountMode = false;
    fullPassageText = raw;

    inputPassage.value = '';
    parentPanel.open = false;
    audioToolbar.style.display = 'flex';
    btnHint.style.display = 'inline-block';

    const punctRegex = /[，。！？、；：「」『』（）\n\r\s,.!?;:'"()]/;
    tokens = Array.from(raw)
      .filter(ch => ch !== '\n' && ch !== '\r')
      .map(ch => ({
        char: ch,
        isPunctuation: punctRegex.test(ch),
        revealed: punctRegex.test(ch)
      }));

    currentIndex = 0;
    loadCurrentTarget();
    speakCantonese(fullPassageText);
  };

  // 模式二：免打字，整段空白方格（預設 20 格，鋪滿成個螢幕）
  const startFreeCountDictation = (count: number) => {
    isFreeCountMode = true;
    fullPassageText = '';
    parentPanel.open = false;
    audioToolbar.style.display = 'none';
    btnHint.style.display = 'none';

    tokens = Array.from({ length: count }, () => ({
      char: '✓',
      isPunctuation: false,
      revealed: false
    }));

    currentIndex = 0;
    loadCurrentTarget();
  };

  btnConfirmWord.addEventListener('click', () => {
    if (currentIndex >= tokens.length) return;
    if (isFreeCountMode) {
      tokens[currentIndex].char = '✓';
      tokens[currentIndex].revealed = true;
      traceCanvas.clearInk();
      currentIndex++;
      loadCurrentTarget();
    } else {
      handleCharacterSuccess();
    }
  });

  btnStartPassage.addEventListener('click', startPassageDictation);
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const count = Number((btn as HTMLElement).dataset.count || 20);
      startFreeCountDictation(count);
    });
  });

  btnSpeakSentence.addEventListener('click', () => speakCantonese(fullPassageText));
  btnSpeakChar.addEventListener('click', () => {
    if (!isFreeCountMode && currentIndex < tokens.length) {
      speakCantonese(tokens[currentIndex].char);
    }
  });
  btnHint.addEventListener('click', () => traceCanvas.flashHint(1800));
  btnClear.addEventListener('click', () => traceCanvas.clearInk());

  // 預設啟動 20 個空白格仔，盡用成個螢幕空間，一打開就可以直接默一段！
  startFreeCountDictation(20);
}

window.addEventListener('DOMContentLoaded', initApp);
