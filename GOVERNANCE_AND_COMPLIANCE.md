# ⚖️ 系統治理、合規邊界與免責聲明
# Governance, Regulatory Applicability & Disclaimer

[繁體中文](#zh-gov) ｜ [English](#en-gov)

---

<a id="zh-gov"></a>
## 🇭🇰 繁體中文聲明

### 1. 系統性質與技術邊界（無人工智能聲明）
**童温默書（KidsPrepDictate）** 是一款純前端、離線優先（Offline-First）的靜態網頁應用程式（PWA）。為確保合規評估建基於客觀技術事實，本專案明確界定其運算機制如下：

* **零人工智能與零機器學習（Zero-AI / Non-ML）**：本系統的中文手寫比對引擎（`DictationMatcher`）與英文拼寫比對完全採用**確定性數學與幾何演算法（Deterministic Algorithms）**——包括筆跡座標重採樣、向量餘弦相似度、64×64 像素光柵化重疊率（F1-Score）及編輯距離（Levenshtein Distance）。系統不包含任何神經網絡、大語言模型（LLM）、統計推論或自主演化學習機制。
* **零後端與零資料傳輸（Zero-Backend & Zero-Data-Retention）**：本專案不設任何後端伺服器、資料庫或雲端 API。所有課文、手寫筆跡及學習進度僅在使用者裝置本機瀏覽器內即時運算並儲存於 `localStorage`，絕不回傳至專案維護者或任何第三方伺服器。
* **本機語音介面調用**：語音朗讀功能僅透過標準瀏覽器 `Web Speech API` 調用使用者作業系統（如 iOS / Android / Windows / macOS）內建的文字轉語音（TTS）引擎。

---

### 2. 全球法規與國際標準適用性矩陣（如實反映，不畫蛇添足）

| 法規／標準框架 | 適用性判定 | 技術與法理依據 |
| :--- | :--- | :--- |
| **歐盟《人工智能法案》**<br>(EU AI Act, Reg. (EU) 2024/1689) | **不適用**<br>(Out of Scope) | 依據第 3(1) 條及序言第 12 條，僅基於預定義數學規則與確定性幾何運算、不具備機器學習推論或自主適應能力的軟件，不構成該法案定義之「人工智能系統（AI System）」。 |
| **ISO/IEC 42001**<br>(人工智能管理體系 AIMS) | **不適用**<br>(Not Applicable) | 本專案不包含任何 AI 系統的開發、部署或營運，故不適用人工智能管理體系標準。 |
| **中國國家網信辦相關規定**<br>(《生成式AI辦法》／《算法推薦規定》／《兒童個人信息網絡保護規定》) | **不適用／源頭規避**<br>(Not Applicable / Exempt by Design) | 1. 無生成式 AI 模型及算法推薦／資訊流分發機制，不適用相關備案與合規義務。<br>2. 系統不設帳號註冊亦不收集任何兒童個人信息，從架構源頭規避資料收集風險。 |
| **歐盟《通用資料保障條例》**<br>(EU/UK GDPR，含第 8 條兒童資料及第 25 條私隱設計) | **架構對齊（零控制者責任）**<br>(Aligned via Data Minimization) | 所有運算均於使用者本機端完成，專案維護者不接收、不儲存亦無法存取任何個人資料，不構成處理個人資料的「資料控制者（Data Controller）」。 |
| **香港《個人資料（私隱）條例》**<br>(第 486 章 / HK PDPO) | **架構對齊（零收集）**<br>(Aligned / Zero Collection) | 維護者並無收集、持有、處理或使用任何《條例》第 2(1) 條所界定之「個人資料」，符合香港個人資料私隱專員公署（PCPD）倡議的「私隱設計（Privacy-by-Design）」與兒童網上私隱最佳實務。 |
| **ISO/IEC 27001 & ISO/IEC 27701**<br>(資訊安全與私隱資訊管理) | **控制目標對齊（非認證實體）**<br>(Control-Aligned, Uncertified) | 本專案為開源程式碼倉庫而非商業認證機構，不具備第三方正式認證；惟其安全標頭（CSP、`Permissions-Policy`）、鎖定依賴（Frozen Lockfile）及乾淨室 CI/CD 門禁均對齊相關技術保安與私隱保護原則。 |

---

### 3. 開源維護者免責與責任限制聲明（保障條款）
1. **教育輔助性質**：本軟件僅作為家庭及個人溫習默書的輔助練習工具，不代表任何學校、考試機構或官方課程評核標準。筆順與字形評分僅供練習參考，家長及教師應按實際教學需要作最終指導。
2. **作業系統語音依賴**：本程式的粵語及英語朗讀準確度、語音可用性及離線支援程度，完全取決於使用者裝置作業系統及瀏覽器供應商所提供的內建語音包，維護者無法就第三方系統語音的差異承擔責任。
3. **按「現狀」提供（AS IS）**：依據本專案之 [MIT 授權條款](./LICENSE)，本軟件按「現狀」提供，不附帶任何明示或暗示的保證（包括但不限於適銷性、特定用途適用性及不侵權保證）。在適用法律允許的最大範圍內，專案作者及貢獻者均不對因使用或無法使用本軟件而引致的任何直接、間接或附帶損失承擔法律責任。

---

<a id="en-gov"></a>
## 🇬🇧 English Statement

### 1. System Nature & Technical Boundaries (Non-AI Declaration)
**KidsPrepDictate** is a pure client-side, offline-first Progressive Web App (PWA). To ensure regulatory assessments are grounded in accurate engineering facts, the system boundaries are explicitly defined as follows:

* **Zero AI & Zero Machine Learning**: Both the Traditional Chinese handwriting matcher (`DictationMatcher`) and English spelling evaluator rely strictly on **deterministic mathematical and geometric algorithms**—specifically coordinate resampling, vector cosine similarity, 64×64 pixel rasterization overlap (F1-score), and Levenshtein edit distance. The software contains no neural networks, large language models (LLMs), statistical inference, or autonomous adaptive learning.
* **Zero-Backend & Zero-Data-Retention**: The project operates without any backend servers, databases, or cloud APIs. All custom passages, handwriting strokes, and session states are processed locally in browser memory and persisted solely in the user's local `localStorage`. No data is ever transmitted to the maintainer or any third party.
* **Local Speech Interface**: Audio pronunciation invokes the native `Web Speech API` provided by the user's operating system (iOS, Android, Windows, macOS) without routing audio through external project servers.

---

### 2. Global Regulatory & Standards Applicability Matrix

| Framework / Standard | Applicability Status | Technical & Legal Rationale |
| :--- | :--- | :--- |
| **EU Artificial Intelligence Act**<br>(Regulation (EU) 2024/1689) | **Out of Scope / Not Applicable** | Under Article 3(1) and Recital 12, software executing deterministic rules and fixed geometric calculations without machine-based inference or post-deployment adaptiveness does not constitute an "AI system." |
| **ISO/IEC 42001**<br>(AI Management System - AIMS) | **Not Applicable** | No AI system is developed, provided, or operated within this repository; therefore, an AI management system standard does not apply. |
| **CAC Regulations (Mainland China)**<br>(Generative AI Measures / Algorithm Recommendation / Children's Online Privacy) | **Not Applicable / Exempt by Design** | 1. Contains no generative AI models or algorithmic content feeds.<br>2. Collects zero personal information and requires no user accounts, eliminating children's data collection exposure at the architectural level. |
| **EU / UK GDPR**<br>(incl. Art. 8 Children's Data & Art. 25 Privacy-by-Design) | **Aligned (No Controller Processing)** | All computation occurs locally on the user's device. The maintainer neither receives, stores, nor accesses any personal data and does not act as a Data Controller. |
| **Hong Kong Personal Data (Privacy) Ordinance**<br>(Cap. 486 / HK PDPO) | **Aligned (Zero Collection)** | No "personal data" (as defined in s.2(1)) is collected, held, processed, or used by the maintainer. Aligns with HK PCPD *Privacy-by-Design* and child online privacy best practices. |
| **ISO/IEC 27001 & ISO/IEC 27701**<br>(InfoSec & Privacy Management) | **Control-Aligned (Uncertified)** | As an open-source codebase rather than a certified organization, formal ISO certification does not apply; however, technical controls (CSP, `Permissions-Policy`, frozen lockfile, clean-room CI/CD) align with client-side security and privacy-by-design principles. |

---

### 3. Open-Source Maintainer Disclaimer & Limitation of Liability
1. **Educational Practice Aid**: This software is intended solely as a supplementary home-study tool and does not represent any school, examination authority, or official curriculum assessment standard. Stroke-order and glyph scoring are indicative only.
2. **OS-Level TTS Dependency**: Pronunciation availability, accent accuracy, and offline voice support depend entirely on the text-to-speech engines supplied by the user's device operating system and browser vendor.
3. **Provided "AS IS"**: Pursuant to the [MIT License](./LICENSE), this software is provided "AS IS", without warranty of any kind, express or implied. To the maximum extent permitted by applicable law, the author and contributors shall not be liable for any claim, damages, or other liability arising from the use of the software.
