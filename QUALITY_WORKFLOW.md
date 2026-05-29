# 四個遊戲品質工作流程與執行計畫

本文件是 `arcade-game-hub` 的正式品質流程。目標不是只完成畫面調整，而是讓四個遊戲在本地、GitHub、Cloudflare Pages 上都能以可驗證的標準穩定交付。

## 1. 最終品質目標

四個遊戲必須達到以下標準：

1. 遊戲舞台與 canvas 皆維持 16:9。
2. 桌機、手機直向、手機橫向都不能出現主要遊戲畫面裁切。
3. 頁面不能出現水平捲動。
4. 太空射擊不能有主攝影機隨機位移或劇烈抖動。
5. 每個遊戲都有可見的小任務、進度與實際獎勵。
6. HUD、任務文字、按鈕不能遮擋核心遊戲元素。
7. 每個遊戲至少可連續遊玩 3 分鐘，不出現卡死、重大掉幀、輸入失效。
8. GitHub 最新 commit 與 Cloudflare production 部署來源一致。
9. 100 個版本迭代必須有可追蹤紀錄與驗收結果，不能只做描述性流水帳。

## 2. 硬性禁止項目

以下任一情況發生時，不得部署：

1. 太空射擊主畫面使用 `ctx.translate(rand(...))`、`Math.random()` 或 `screenShake` 造成全畫面位移。
2. 任一遊戲舞台比例不是 16:9。
3. 任一遊戲在 `1440x900`、`390x844`、`844x390` 下發生水平 overflow。
4. canvas 為空白或未成功繪製。
5. 任務文字不存在、任務進度不更新，或獎勵沒有改變遊戲狀態。
6. console 出現未處理錯誤。
7. Cloudflare production 版本不是 GitHub 最新 commit。

## 3. 遊戲分項改進目標

| 遊戲 | 主要風險 | 必須完成的改善 |
| --- | --- | --- |
| Space Bee Shooter | 劇烈畫面抖動、戰鬥資訊密度高 | 移除主攝影機抖動，保留局部閃光與粒子回饋，任務獎勵不可影響可玩性 |
| Neon Snake Arena | 手機比例、任務深度 | 16:9 自適應、任務輪替、完成後給結晶/護盾/相位能力 |
| Neon Pong Duel | 任務與回合獎勵不足 | 每個對手有不同小任務，長回合、道具、特殊得分都有獎勵 |
| Starlight Runner | 關卡任務不足 | 每關有收集、擊敗、生存或探索任務，完成後給生命、能力或分數 |

## 4. 執行流程

每次修改都依照以下順序執行：

1. 確認修改範圍與受影響遊戲。
2. 實作版面、任務、獎勵或穩定性修正。
3. 執行靜態檢查。
4. 執行自動化 QA。
5. 進行人工 3 分鐘遊玩驗收。
6. commit 並 push 到 GitHub。
7. 部署到 Cloudflare Pages。
8. 驗證 production URL 與部署 commit。
9. 更新版本紀錄。

## 5. 自動化 QA 檢查點

自動化 QA 使用 `node scripts/qa-cdp.js` 執行。未指定網址時，腳本會啟動本地靜態伺服器與 headless Chrome，檢查四個遊戲在三種視窗尺寸下的狀態。

Production 也必須使用同一套檢查：

```text
node scripts/qa-cdp.js --production
```

或指定任意部署網址：

```text
node scripts/qa-cdp.js --base-url=https://65c3a419.arcade-game-hub.pages.dev/
```

必須檢查的尺寸：

| 名稱 | 尺寸 |
| --- | --- |
| desktop | 1440x900 |
| mobile-portrait | 390x844 |
| mobile-landscape | 844x390 |

每個遊戲每個尺寸都必須通過：

1. 頁面載入成功。
2. `.stage-wrap` 存在。
3. `canvas` 存在。
4. 舞台顯示比例接近 16:9。
5. canvas 顯示比例接近 16:9。
6. 沒有水平 overflow。
7. canvas 不是空白畫面。
8. 任務或狀態文字存在。
9. console 沒有 error。

Space Bee Shooter 額外檢查：

1. `draw()` 內不得使用 `ctx.translate()` 做主畫面位移。
2. `draw()` 內不得讀取 `screenShake`。
3. `draw()` 內不得使用 `rand()` 或 `Math.random()` 影響全畫面位置。

## 6. 人工驗收檢查點

自動化 QA 通過後，仍需人工測試，因為遊戲體驗不能只靠 DOM 與 canvas 檢查判斷。

每個遊戲至少測 3 分鐘：

1. 開始、暫停、重開是否正常。
2. 操作是否穩定。
3. 任務是否看得懂。
4. 任務完成是否真的有獎勵。
5. 獎勵是否破壞平衡。
6. HUD 是否遮擋核心元素。
7. 手機橫向是否可玩。
8. 遊戲結束與返回流程是否正常。

Space Bee Shooter 額外測試：

1. 高密度敵人場景。
2. 玩家受擊。
3. 敵人爆炸。
4. Boss 或大型敵人出現。
5. EMP、核彈、雷射、火焰、冰凍等特效。

任何一項造成視覺劇烈抖動或無法瞄準，都視為失敗。

## 7. 100 版迭代管理

100 個版本分成五組，每組都有明確目的與驗收要求。

| 版本範圍 | 目標 | 驗收方式 |
| --- | --- | --- |
| v001-v020 | 16:9 與自適應版面 | QA 腳本三尺寸通過 |
| v021-v040 | 太空射擊穩定性與抖動移除 | 靜態檢查與 3 分鐘戰鬥測試 |
| v041-v060 | 四個遊戲任務與獎勵 | 任務進度與獎勵狀態可驗證 |
| v061-v080 | HUD、手機操作、視覺可讀性 | 桌機與手機人工測試 |
| v081-v100 | 效能、部署、回歸測試 | QA、production 驗收、回滾點確認 |

每個版本紀錄必須包含：

```text
版本號
修改項目
影響的遊戲
驗收方式
測試結果
是否通過
是否需要回滾
```

不接受只有「改善體驗」、「優化畫面」、「調整細節」這類無法驗證的描述。

## 8. 部署檢查

部署前：

1. `git status --short --branch` 確認工作樹狀態。
2. `node scripts/qa-cdp.js` 必須通過。
3. 必要時執行 `node --check` 檢查四個 `game.js`。
4. commit 訊息需對應實際修改。
5. push 到 GitHub main。

部署後：

1. Cloudflare Pages production URL 回傳 200。
2. Cloudflare deployment source commit 等於 GitHub main latest commit。
3. production 版本重新檢查四個遊戲可載入。
4. production Space Bee Shooter 不得出現主畫面抖動回歸。

## 9. 回滾條件

以下情況需停止發佈並回滾到上一個穩定 commit：

1. 任一遊戲 production 無法載入。
2. 太空射擊抖動問題回歸。
3. 手機尺寸發生嚴重裁切。
4. 任務系統造成遊戲卡死。
5. Cloudflare production commit 與 GitHub main 不一致。
6. QA 腳本在 production 對應內容上發現關鍵失敗。

## 10. 完成定義

本專案一次有效交付必須同時滿足：

1. 四個遊戲通過自動化 QA。
2. 四個遊戲完成 3 分鐘人工測試。
3. Space Bee Shooter 通過抖動回歸檢查。
4. 任務與獎勵在四個遊戲中都能被觸發並驗證。
5. GitHub 與 Cloudflare production 版本一致。
6. 版本紀錄能說明每個階段做了什麼、如何驗收、結果是否通過。
