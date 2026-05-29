# 遊戲集合面板 Game Hub

把目前四個遊戲專案集中在同一個面板中，方便選擇、內嵌遊玩、重載或用新分頁開啟。

## 遊戲

- `starlight-runner`：星光跑者
- `neon-pong-duel`：霓虹乒乓聯盟
- `neon-snake-arena`：霓虹蛇域
- `space-bee-shooter`：太空蜜蜂射擊

## 執行

建議從 `projects` 根目錄啟動伺服器，這樣集合面板才能載入四個兄弟專案：

```powershell
cd C:\Users\abckf\projects
python -m http.server 4200 --bind 127.0.0.1
```

開啟：

```text
http://127.0.0.1:4200/game-collection/
```

## 擴充

新增遊戲時，在 `launcher.js` 的 `games` 陣列加入：

- `id`
- `title`
- `genre`
- `path`
- `thumb`
- `description`
- `tags`

空白擴充槽目前保留在 `emptySlots`。
