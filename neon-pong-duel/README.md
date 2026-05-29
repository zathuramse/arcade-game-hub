# 霓虹乒乓聯盟 Neon Pong Duel

一個玩家對電腦隊的高完成度 Pong / 乒乓球網頁遊戲。專案是純 HTML、CSS、Canvas JavaScript，無外部依賴。

## 執行

直接開 `index.html` 可玩。也可以用本機伺服器：

```powershell
python -m http.server 4180
```

然後開啟 `http://127.0.0.1:4180`。

## 操作

- W / S 或方向鍵：移動球拍
- 滑鼠 / 觸控拖曳：移動球拍
- Space / Shift：Strike 強打
- F：Focus 慢速專注
- E：Shield 球門護盾
- Enter：開始 / 繼續
- R：重新開始

## 內容

- 三名電腦隊主將：Vector-7、Mirage Unit、Titan Core
- AI 會預判落點、根據回合壓力提高侵略性
- 支援機會在右半場補位並反彈來球
- 中央道具：擴拍、多球、曲球、慢速、護盾
- 球速、旋轉、反彈角、強打與多球完整實作
- 粒子、衝擊波、軌跡、掃描格線、畫面震動與球門護盾
- 響應式版面與手機按鈕

## 檔案

- `index.html`：頁面與 HUD
- `styles.css`：響應式 UI 與視覺樣式
- `game.js`：遊戲邏輯、AI、物理、道具、技能、渲染
- `ITERATION_LOG.md`：製作與 QA 迭代紀錄
