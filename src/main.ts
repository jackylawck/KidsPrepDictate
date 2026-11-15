// src/main.ts
import type { DictationToken, Point, StrokeData, VerifyResult } from './types';
import { TraceCanvas } from './ui/canvas-trace';
import { DictationMatcher } from './core/dictation-matcher';

const CORE_COMMON_CHARS =
  '一二三四五六七八九十人口手目耳日月水火木金土山石田禾上下大小多少左右前後中出入來去你我他她它們的是在有和與不這那好很太都也又就說看聽寫讀學愛家爸媽哥弟姐妹老師同學朋友春夏天秋風雨雪雲電花草樹木鳥魚蟲牛羊馬狗貓心手足頭面眉眼鼻口牙舌身衣食住行開關門窗桌椅書筆紙車船飛機紅黃藍綠黑白高矮長短快慢新舊冷熱早晚今明昨床牀光疑地霜舉望低思故鄉';

const STORAGE_KEY = 'kidsprep_session_v2';

function initApp() {
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let audioUnlocked = false;

  if (synth) {
    synth.getVoices();
    synth.onvoiceschanged = () => synth.getVoices();
  }

  // 在使用者首次點擊時發送靜音語音以解鎖 iOS Safari / Chrome 自動播放限制
  const unlockAudioEngine = () => {
    if (audioUnlocked || !synth) return;
    try {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      synth.speak(silent);
      audioUnlocked = true;
    } catch { /* ignore */ }
  };
  document.addEventListener('pointerdown', unlockAudioEngine, { once: true });

  const traceCanvas = new TraceCanvas('trace-canvas', 'ink-canvas', 'stroke-badge');

  const parentPanel = document.getElementById('parent-panel') as HTMLDetailsElement;
  const btnFreeMode = document.getElementById('btn-free-mode') as HTMLButtonElement;
  const inputPassage = document.getElementById('input-passage') as HTMLTextAreaElement;
  const btnStartPassage = document.getElementById('btn-start-passage') as HTMLButtonElement;
  const progressPill = document.getElementById('progress-pill') as HTMLElement;

  const btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
  const btnSpeakChar = document.getElementById('btn-speak-char') as HTMLButtonElement;
  const slotsContainer = document.getElementById('sentence-slots') as HTMLElement;
  const feedbackBanner = document.getElementById('feedback-banner') as HTMLElement;
  const candidateBar = document.getElementById('candidate-bar') as HTMLElement;

  const btnConfirmWord = document.getElementById('btn-confirm-word') as HTMLButtonElement;
  const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
  const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

  let tokens: DictationToken[] = [];
  let currentIndex = 0;
  let fullPassageText = '';
  let isFreeWriteMode = true;
  let loadRequestId = 0; // 防止連續跳過造成 fetch 競態覆蓋

  const candidatePool: StrokeData[] = [];
  const charCache = new Map<string, StrokeData>();
  const baseUrl = import.meta.env.BASE_URL || '/';

  const preloadCandidatePool = async () => {
    const uniqueChars = Array.from(new Set(Array.from(CORE_COMMON_CHARS)));
    await Promise.all(
      uniqueChars.map(async (ch) => {
        const code = ch.codePointAt(0);
        if (!code) return;
        const unicode = code.toString(16).toUpperCase().padStart(4, '0');
        try {
          const res = await fetch(`${baseUrl}data/${unicode}.json`);
          if (res.ok) {
            const data: StrokeData = await res.json();
            if (data.medians && data.medians.length > 0) {
              charCache.set(ch, data);
              candidatePool.push(data);
            }
          }
        } catch { /* ignore */ }
      })
    );
  };

  const showBanner = (msg: string, isError = false) => {
    feedbackBanner.textContent = msg;
    feedbackBanner.style.display = 'block';
    feedbackBanner.classList.toggle('warning-error', isError);
    window.setTimeout(() => { feedbackBanner.style.display = 'none'; }, 2400);
  };

  const speakCantonese = (text: string) => {
    if (!text || !synth) return;
    if (synth.speaking) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;

    const voices = synth.getVoices();
    const hkVoice = voices.find(v => /yue|cantonese|hong kong|zh-hk|粵|廣東/i.test(v.name + ' ' + v.lang));
    const zhFallback = voices.find(v => /zh-cn|zh-tw|mandarin|cmn|普通|國語/i.test(v.lang + ' ' + v.name));

    if (hkVoice) {
      utterance.lang = 'zh-HK';
      utterance.voice = hkVoice;
    } else if (zhFallback) {
      utterance.lang = zhFallback.lang;
      utterance.voice = zhFallback;
      showBanner('ℹ️ 裝置未安裝粵語語音，暫用普通話朗讀');
    } else {
      utterance.lang = 'zh-HK';
    }

    utterance.onerror = () => {
      showBanner('⚠️ 語音播放失敗，請檢查裝置靜音開關', true);
    };

    synth.speak(utterance);
  };

  const saveSessionProgress = () => {
    if (isFreeWriteMode || !fullPassageText) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        passage: fullPassageText,
        tokens,
        currentIndex,
        timestamp: Date.now()
      }));
    } catch { /* ignore */ }
  };

  const updateProgressBadge = () => {
    const totalChars = tokens.filter(t => !t.isPunctuation).length;
    const doneChars = tokens.filter(t => !t.isPunctuation && t.revealed).length;
    progressPill.textContent = isFreeWriteMode
      ? `無家長自由模式：已寫 ${doneChars} 字`
      : `嚴格默書：${doneChars} / ${totalChars} 字`;
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
        if (token.skipped) div.style.opacity = '0.65';
        div.textContent = token.char;
      } else if (idx === currentIndex) {
        div.classList.add('active');
        div.textContent = '✍️';
        activeEl = div;
      }
      slotsContainer.appendChild(div);
    });

    updateProgressBadge();
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const renderCandidateBar = (candidates: string[], targetSlotIdx: number) => {
    if (!isFreeWriteMode || candidates.length === 0) {
      candidateBar.style.display = 'none';
      return;
    }
    candidateBar.style.display = 'flex';
    candidateBar.style.gap = '6px';
    candidateBar.style.marginBottom = '8px';
    candidateBar.innerHTML = '<span style="font-size:0.8rem;color:#666;align-self:center;">選字修正：</span>';

    candidates.forEach(ch => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = ch;
      btn.style.cssText = 'padding:4px 10px;border:1px solid #00796b;border-radius:6px;background:#e0f2f1;font-weight:bold;font-size:1.1rem;cursor:pointer;';
      btn.addEventListener('click', () => {
        if (tokens[targetSlotIdx]) {
          tokens[targetSlotIdx].char = ch;
          renderSlots();
          speakCantonese(ch);
        }
      });
      candidateBar.appendChild(btn);
    });
  };

  const loadCurrentTarget = async () => {
    const reqId = ++loadRequestId;

    while (currentIndex < tokens.length && tokens[currentIndex].isPunctuation) {
      tokens[currentIndex].revealed = true;
      currentIndex++;
    }

    if (isFreeWriteMode && currentIndex >= tokens.length) {
      tokens.push(...Array.from({ length: 10 }, () => ({ char: '', isPunctuation: false, revealed: false })));
    }

    renderSlots();
    saveSessionProgress();

    if (!isFreeWriteMode && currentIndex >= tokens.length) {
      localStorage.removeItem(STORAGE_KEY);
      const skippedCount = tokens.filter(t => t.skipped).length;
      const summary = skippedCount > 0
        ? `🎉 完成默書！共有 ${skippedCount} 個跳過字需要再溫習`
        : '🎉 滿分過關！成段默書全部筆畫正確！';
      showBanner(summary);
      speakCantonese('好叻呀！成段默書完成啦！');
      return;
    }

    if (isFreeWriteMode) {
      traceCanvas.enterFreeWriteMode();
      return;
    }

    const targetChar = tokens[currentIndex].char;
    if (charCache.has(targetChar)) {
      traceCanvas.loadDictationTarget(charCache.get(targetChar)!);
      return;
    }

    const code = targetChar.codePointAt(0);
    if (!code) return;
    const unicode = code.toString(16).toUpperCase().padStart(4, '0');

    try {
      const res = await fetch(`${baseUrl}data/${unicode}.json`);
      if (reqId !== loadRequestId) return; // 已被後續跳過指令取代，直接作廢
      if (!res.ok) throw new Error('Not found');
      const data: StrokeData = await res.json();
      if (reqId !== loadRequestId) return;

      charCache.set(targetChar, data);
      traceCanvas.loadDictationTarget(data);
    } catch {
      if (reqId !== loadRequestId) return;
      // 缺字誠實標記無 medians，交由驗證器提示跳過，絕不送分
      traceCanvas.loadDictationTarget({ char: targetChar, unicode, totalStrokes: 0, strokes: [], medians: [] });
    }
  };

  const handleStrictResult = (result: VerifyResult) => {
    if (currentIndex >= tokens.length) return;

    if (result.status === 'SUCCESS') {
      if (navigator.vibrate) navigator.vibrate(25);
      tokens[currentIndex].revealed = true;
      showBanner(result.message);
      currentIndex++;
      loadCurrentTarget();
    } else {
      showBanner(result.message, true);
      traceCanvas.scheduleFailClear(950);
    }
  };

  const handleFreeRecognize = (strokes: Point[][]) => {
    if (currentIndex >= tokens.length) return;
    const candidates = DictationMatcher.recognizeTopCandidates(strokes, candidatePool, 5);

    if (candidates.length === 0) {
      showBanner('❌ 認唔到呢個字，請寫清楚啲再試！', true);
      traceCanvas.scheduleFailClear(900);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(20);
    const bestMatch = candidates[0];
    const writtenSlotIdx = currentIndex;
    tokens[writtenSlotIdx].char = bestMatch;
    tokens[writtenSlotIdx].revealed = true;

    renderCandidateBar(candidates, writtenSlotIdx);
    showBanner(`✨ 認到「${bestMatch}」字！`);
    speakCantonese(bestMatch);

    currentIndex++;
    loadCurrentTarget();
  };

  traceCanvas.setCallbacks(handleStrictResult, handleFreeRecognize);

  const startFreeMode = () => {
    isFreeWriteMode = true;
    fullPassageText = '';
    parentPanel.open = false;
    btnHint.style.display = 'none';
    btnSpeakChar.style.display = 'none';
    candidateBar.style.display = 'none';

    tokens = Array.from({ length: 20 }, () => ({
      char: '',
      isPunctuation: false,
      revealed: false
    }));
    currentIndex = 0;
    loadCurrentTarget();
  };

  const startPassageDictation = (rawText: string, shouldSpeak: boolean = true) => {
    const raw = rawText.trim();
    if (!raw) {
      showBanner('請先貼上默書課文！', true);
      return;
    }
    isFreeWriteMode = false;
    fullPassageText = raw;

    inputPassage.value = '';
    parentPanel.open = false;
    btnHint.style.display = 'inline-block';
    btnSpeakChar.style.display = 'inline-block';
    candidateBar.style.display = 'none';

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
    if (shouldSpeak) speakCantonese(fullPassageText);
  };

  btnConfirmWord.addEventListener('click', () => {
    traceCanvas.triggerVerificationNow();
  });

  btnFreeMode.addEventListener('click', startFreeMode);
  btnStartPassage.addEventListener('click', () => startPassageDictation(inputPassage.value, true));

  btnSpeakSentence.addEventListener('click', () => {
    if (isFreeWriteMode) {
      const writtenText = tokens.filter(t => t.revealed).map(t => t.char).join('');
      if (writtenText) speakCantonese(writtenText);
    } else {
      speakCantonese(fullPassageText);
    }
  });

  btnSpeakChar.addEventListener('click', () => {
    if (!isFreeWriteMode && currentIndex < tokens.length) {
      speakCantonese(tokens[currentIndex].char);
    }
  });

  btnHint.addEventListener('click', () => traceCanvas.flashHint(1800));
  btnClear.addEventListener('click', () => traceCanvas.clearInk());

  // 檢查是否有未完成的默書進度可斷點續寫
  const checkSavedSession = () => {
    try {
      const rawSaved = localStorage.getItem(STORAGE_KEY);
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved);
        if (parsed.passage && Array.isArray(parsed.tokens) && parsed.currentIndex < parsed.tokens.length) {
          isFreeWriteMode = false;
          fullPassageText = parsed.passage;
          tokens = parsed.tokens;
          currentIndex = parsed.currentIndex;
          btnHint.style.display = 'inline-block';
          btnSpeakChar.style.display = 'inline-block';
          loadCurrentTarget();
          showBanner('📌 已為你恢復上次未完成的默書進度（點擊「朗讀段落」聽聲）');
          return;
        }
      }
    } catch { /* ignore */ }

    startFreeMode();
  };

  preloadCandidatePool();
  checkSavedSession();
}

window.addEventListener('DOMContentLoaded', initApp);
