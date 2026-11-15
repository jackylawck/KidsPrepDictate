// src/main.ts
import { TraceCanvas, StrokeData } from './ui/canvas-trace';
import { DictationMatcher, Point } from './core/dictation-matcher';

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
  const inputPassage = document.getElementById('input-passage') as HTMLInputElement;
  const btnStartPassage = document.getElementById('btn-start-passage') as HTMLButtonElement;
  const presetBtns = document.querySelectorAll('.btn-preset');

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
  let isFreeCountMode = false; // 模式二：免打字純格數模式

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
    window.setTimeout(() => { feedbackBanner.style.display = 'none'; }, 2400);
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
    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    renderSlots();

    if (currentIndex >= tokens.length) {
      traceCanvas.clearData();
      showBanner('🎉 叻仔！全部方格寫完啦！');
      speakCantonese('好叻呀！全部寫完啦！');
      return;
    }

    // 模式二（免打字格數模式）：不設預定答案，直接顯示空白米字格等小朋友寫
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

  // 模式一：家長輸入課文 -> 自動收起輸入框防偷睇
  const startPassageDictation = () => {
    const raw = inputPassage.value.trim();
    if (!raw) {
      showBanner('請先輸入默書課文，或者揀下面格數按鈕！', true);
      return;
    }
    isFreeCountMode = false;
    fullPassageText = raw;

    // 鎖定後立即清空輸入框並摺疊家長面板，確保小朋友睇唔到任何提示！
    inputPassage.value = '';
    parentPanel.open = false;
    audioToolbar.style.display = 'flex';
    btnHint.style.display = 'inline-block';

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

  // 模式二：免打字，直接設定格數（例如 5 個字）
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
    showBanner(`已設定 ${count} 個字格仔，請在下方米字格寫字！`);
  };

  // 手動確認「寫好此字」（同時支援模式一強制過關及模式二完成單字）
  btnConfirmWord.addEventListener('click', () => {
    if (currentIndex >= tokens.length) return;
    if (isFreeCountMode) {
      // 將手寫板筆跡轉成縮圖或標記完成，跳到下一格
      tokens[currentIndex].char = '字';
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
      const count = Number((btn as HTMLElement).dataset.count || 5);
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

  // 預設啟動 5 個空白格仔，一打開就可以直接寫字，完全唔會劇透任何字！
  startFreeCountDictation(5);
}

window.addEventListener('DOMContentLoaded', initApp);
