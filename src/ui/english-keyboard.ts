// src/ui/english-keyboard.ts
import { t } from '../i18n';

export interface EnglishKeyboardCallbacks {
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

// 效能優化：預先編譯正則，避免 input 事件頻繁觸發時重複創建
const REGEX_VALID_EN_INPUT = /[^a-zA-Z\s'-]/g;

export class EnglishKeyboard {
  private container: HTMLElement;
  private sysInput: HTMLInputElement | null;
  private value: string = '';
  private maxLength: number = 32;
  private useSystemKeyboard: boolean = false;
  private callbacks: EnglishKeyboardCallbacks;
  private spaceBtn: HTMLButtonElement | null = null;
  
  // 長按刪除機制
  private backspaceInterval: number | null = null;
  private backspaceTimeout: number | null = null;

  constructor(
    containerId: string,
    sysInputId: string,
    callbacks: EnglishKeyboardCallbacks
  ) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`找不到英文鍵盤容器 #${containerId}`);
    this.container = el;
    this.sysInput = document.getElementById(sysInputId) as HTMLInputElement | null;
    this.callbacks = callbacks;

    // 防止 iOS Safari 雙擊放大
    this.container.style.touchAction = 'manipulation';
    
    this.render();
    this.bindSystemInput();
  }

  public setMaxLength(len: number): void {
    this.maxLength = Math.max(1, len);
  }

  public getValue(): string {
    return this.value;
  }

  public clear(): void {
    this.value = '';
    if (this.sysInput) this.sysInput.value = '';
    this.callbacks.onChange(this.value);
  }

  public setUseSystemKeyboard(enabled: boolean): void {
    this.useSystemKeyboard = enabled;
    this.container.style.display = enabled ? 'none' : 'flex';
    if (this.sysInput) {
      if (enabled) {
        this.sysInput.value = this.value;
        this.sysInput.focus();
      } else {
        this.sysInput.blur();
      }
    }
  }

  public updateLocalization(): void {
    if (this.spaceBtn) {
      this.spaceBtn.textContent = `␣ ${t('enSpaceKey')}`;
    }
  }

  private playKeyFeedback(): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // 輕微震動回饋
      navigator.vibrate(10);
    }
  }

  private handleDelete(): void {
    if (this.value.length > 0) {
      this.value = this.value.slice(0, -1);
      if (this.sysInput) this.sysInput.value = this.value;
      this.callbacks.onChange(this.value);
    }
  }

  private handleKey(key: string): void {
    this.playKeyFeedback();

    if (key === 'Backspace') {
      this.handleDelete();
      return;
    }

    if (key === 'Enter') {
      this.callbacks.onSubmit(this.value);
      return;
    }

    if (this.value.length < this.maxLength) {
      this.value += key.toLowerCase();
      if (this.sysInput) this.sysInput.value = this.value;
      this.callbacks.onChange(this.value);
    }
  }

  private bindSystemInput(): void {
    if (!this.sysInput) return;

    this.sysInput.addEventListener('input', () => {
      if (!this.useSystemKeyboard || !this.sysInput) return;
      const sanitized = this.sysInput.value
        .replace(REGEX_VALID_EN_INPUT, '')
        .slice(0, this.maxLength)
        .toLowerCase();
        
      if (this.value !== sanitized) {
        this.value = sanitized;
        this.sysInput.value = sanitized;
        this.callbacks.onChange(this.value);
      }
    });

    this.sysInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.callbacks.onSubmit(this.value);
      }
    });
  }
  
  private stopBackspaceRepeat = (): void => {
    if (this.backspaceTimeout) {
      window.clearTimeout(this.backspaceTimeout);
      this.backspaceTimeout = null;
    }
    if (this.backspaceInterval) {
      window.clearInterval(this.backspaceInterval);
      this.backspaceInterval = null;
    }
  };

  private render(): void {
    this.container.innerHTML = '';
    
    // 效能優化：使用 DocumentFragment 進行零重繪 (Zero-Reflow) 批次 DOM 構建
    const fragment = document.createDocumentFragment();

    const rows: string[][] = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['Backspace', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Enter']
    ];

    rows.forEach((row) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'en-kb-row';

      row.forEach((key) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'en-key';

        if (key === 'Backspace') {
          btn.textContent = '⌫';
          btn.classList.add('wide');
          btn.setAttribute('aria-label', 'Backspace');
          
          // 長按連續刪除支援
          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.playKeyFeedback();
            this.handleDelete();
            
            this.backspaceTimeout = window.setTimeout(() => {
              this.backspaceInterval = window.setInterval(() => {
                this.playKeyFeedback();
                this.handleDelete();
              }, 100);
            }, 500);
          });
          
          btn.addEventListener('pointerup', this.stopBackspaceRepeat);
          btn.addEventListener('pointerleave', this.stopBackspaceRepeat);
          btn.addEventListener('pointercancel', this.stopBackspaceRepeat);
          
        } else if (key === 'Enter') {
          btn.textContent = '✓';
          btn.classList.add('wide', 'confirm-key');
          btn.setAttribute('aria-label', 'Confirm');
          
          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.handleKey(key);
          });
          
        } else {
          btn.textContent = key;
          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.handleKey(key);
          });
        }

        rowDiv.appendChild(btn);
      });

      fragment.appendChild(rowDiv);
    });

    const bottomRow = document.createElement('div');
    bottomRow.className = 'en-kb-row';

    const spaceBtn = document.createElement('button');
    spaceBtn.type = 'button';
    spaceBtn.className = 'en-key space';
    spaceBtn.textContent = `␣ ${t('enSpaceKey')}`;
    spaceBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handleKey(' ');
    });
    this.spaceBtn = spaceBtn;

    bottomRow.appendChild(spaceBtn);
    fragment.appendChild(bottomRow);
    
    // 一次性掛載
    this.container.appendChild(fragment);
  }
}
