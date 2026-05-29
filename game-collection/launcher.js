const games = [
  {
    id: "starlight-runner",
    title: "星光跑者",
    genre: "橫向卷軸",
    path: "../starlight-runner/index.html",
    thumb: "../starlight-runner/screenshot-gameplay.png",
    description: "原創橫向卷軸平台冒險，支援跳躍、踩敵、金幣、道具、檢查點、背景音樂與音效。",
    tags: ["平台冒險", "卷軸", "音樂", "手機操作"],
  },
  {
    id: "neon-pong-duel",
    title: "霓虹乒乓聯盟",
    genre: "AI 對戰",
    path: "../neon-pong-duel/index.html",
    thumb: "../neon-pong-duel/screenshot-gameplay.png",
    description: "玩家對電腦隊的霓虹 Pong，含 AI 主將、支援機、技能、道具、多球與球門護盾。",
    tags: ["Pong", "AI", "技能", "道具"],
  },
  {
    id: "neon-snake-arena",
    title: "霓虹蛇域",
    genre: "貪食蛇",
    path: "../neon-snake-arena/index.html",
    thumb: "../neon-snake-arena/screenshot-gameplay.png",
    description: "霓虹貪食蛇競技場，含區段推進、升級、技能、脈衝雷、閃電門與守門者事件。",
    tags: ["貪食蛇", "升級", "技能", "特效"],
  },
  {
    id: "space-bee-shooter",
    title: "太空蜜蜂射擊",
    genre: "太空射擊",
    path: "../space-bee-shooter/index.html",
    thumb: "../space-bee-shooter/screenshot-v820-evolved.png",
    description: "太空射擊遊戲，含波次、升級、特殊武器、Boss 與大量粒子特效。",
    tags: ["射擊", "Boss", "升級", "波次"],
  },
];

const emptySlots = [
  { title: "空白擴充槽 A", genre: "預留", description: "之後可放新的遊戲專案。" },
  { title: "空白擴充槽 B", genre: "預留", description: "可新增關卡型、解謎型或 3D 遊戲。" },
  { title: "空白擴充槽 C", genre: "預留", description: "保留給下一個實驗作品。" },
  { title: "空白擴充槽 D", genre: "預留", description: "可接入未來專案。" },
];

const gameGrid = document.getElementById("gameGrid");
const gameFrame = document.getElementById("gameFrame");
const currentTitle = document.getElementById("currentTitle");
const currentGenre = document.getElementById("currentGenre");
const currentPath = document.getElementById("currentPath");
const playerTitle = document.getElementById("playerTitle");
const playerEyebrow = document.getElementById("playerEyebrow");
const playerDescription = document.getElementById("playerDescription");
const tagRow = document.getElementById("tagRow");
const openButton = document.getElementById("openButton");
const reloadButton = document.getElementById("reloadButton");
const gameCount = document.getElementById("gameCount");

let selectedId = localStorage.getItem("gameHubSelected") || games[0].id;

function renderLibrary() {
  gameCount.textContent = `${games.length} 款可玩`;
  gameGrid.innerHTML = "";
  games.forEach((game) => {
    const button = document.createElement("button");
    button.className = `game-card ${game.id === selectedId ? "active" : ""}`;
    button.type = "button";
    button.dataset.id = game.id;
    button.innerHTML = `
      <div class="thumb" style="background-image: url('${game.thumb}')"></div>
      <div>
        <span>${game.genre}</span>
        <h3>${game.title}</h3>
        <p>${game.description}</p>
      </div>
    `;
    button.addEventListener("click", () => selectGame(game.id));
    gameGrid.appendChild(button);
  });

  emptySlots.forEach((slot) => {
    const card = document.createElement("article");
    card.className = "game-card empty";
    card.innerHTML = `
      <div class="thumb empty-thumb"></div>
      <div>
        <span>${slot.genre}</span>
        <h3>${slot.title}</h3>
        <p>${slot.description}</p>
      </div>
    `;
    gameGrid.appendChild(card);
  });
}

function selectGame(id) {
  const game = games.find((item) => item.id === id) || games[0];
  selectedId = game.id;
  localStorage.setItem("gameHubSelected", selectedId);
  currentTitle.textContent = game.title;
  currentGenre.textContent = game.genre;
  currentPath.textContent = game.id;
  playerTitle.textContent = game.title;
  playerEyebrow.textContent = game.genre;
  playerDescription.textContent = game.description;
  openButton.href = game.path;
  gameFrame.src = game.path;
  tagRow.innerHTML = "";
  game.tags.forEach((tag) => {
    const span = document.createElement("span");
    span.textContent = tag;
    tagRow.appendChild(span);
  });
  renderLibrary();
}

reloadButton.addEventListener("click", () => {
  const game = games.find((item) => item.id === selectedId) || games[0];
  gameFrame.src = game.path;
});

renderLibrary();
selectGame(selectedId);
