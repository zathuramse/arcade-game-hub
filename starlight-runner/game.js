const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

const W = canvas.width;
const H = canvas.height;
const TILE = 48;
const GRAVITY = 2250;
const TAU = Math.PI * 2;
const MAX_PARTICLES = 300;
const MAX_FLOATERS = 28;
const MAX_RINGS = 16;

const $ = (id) => document.getElementById(id);
const ui = {
  score: $("score"),
  coins: $("coins"),
  lives: $("lives"),
  level: $("level"),
  timer: $("timer"),
  power: $("power"),
  missionTitle: $("missionTitle"),
  missionText: $("missionText"),
  checkpointStatus: $("checkpointStatus"),
  startOverlay: $("startOverlay"),
  levelOverlay: $("levelOverlay"),
  gameOverOverlay: $("gameOverOverlay"),
  levelLabel: $("levelLabel"),
  levelTitle: $("levelTitle"),
  levelText: $("levelText"),
  levelButton: $("levelButton"),
  gameOverTitle: $("gameOverTitle"),
  gameOverText: $("gameOverText"),
};

const colors = {
  skyTop: "#122d4f",
  skyBottom: "#6fd4ff",
  cyan: "#2fffd1",
  yellow: "#ffe65a",
  coral: "#ff6d5a",
  violet: "#b96cff",
  green: "#86f06f",
  blue: "#57a8ff",
  dirt: "#7c4a2b",
  grass: "#66d05f",
  brick: "#c86d45",
  dark: "#081018",
  white: "#f4fffb",
};

const state = {
  mode: "start",
  levelIndex: 0,
  score: 0,
  coins: 0,
  lives: 3,
  timer: 300,
  world: null,
  player: null,
  camera: { x: 0, y: 0 },
  keys: new Set(),
  touch: { left: false, right: false, dash: false, down: false },
  jumpQueued: false,
  fireballs: [],
  frameAccumulator: 0,
  particles: [],
  floaters: [],
  stars: [],
  clouds: [],
  screenShake: 0,
  flash: 0,
  rings: [],
  checkpoint: null,
  levelAction: "next",
  secretReturn: null,
  lastTime: 0,
  audio: {
    ctx: null,
    master: null,
    music: null,
    timer: null,
    step: 0,
    enabled: false,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function chance(value) {
  return Math.random() < value;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function createPlayer(x, y) {
  return {
    x,
    y,
    w: 34,
    h: 54,
    baseW: 34,
    baseH: 54,
    big: false,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    invuln: 0,
    power: "none",
    powerTime: 0,
    starTime: 0,
    fireCooldown: 0,
    checkpointLit: false,
    runDust: 0,
    anim: 0,
    landSquash: 0,
    wasGrounded: false,
    dashSound: 0,
  };
}

function addParticle(x, y, color, count = 12, speed = 170, size = 3) {
  count = Math.min(count, Math.max(0, MAX_PARTICLES - state.particles.length));
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, TAU);
    const velocity = rand(speed * 0.25, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(0.35, 0.9),
      maxLife: rand(0.55, 1.0),
      color,
      size: rand(size * 0.55, size * 1.6),
    });
  }
}

function addFloater(text, x, y, color = colors.white) {
  if (state.floaters.length >= MAX_FLOATERS) state.floaters.shift();
  state.floaters.push({ text, x, y, vy: -38, life: 1.1, color });
}

function addRing(x, y, color, radius = 70) {
  if (state.rings.length >= MAX_RINGS) state.rings.shift();
  state.rings.push({ x, y, color, radius, t: 0, life: 0.48 });
}

function makeBlock(x, y, kind = "stone", contents = null) {
  return { x, y, w: TILE, h: TILE, kind, contents, used: false, bump: 0 };
}

function makeCoin(x, y) {
  return { x, y, w: 22, h: 28, phase: rand(0, TAU), taken: false };
}

function makeEnemy(x, y, min, max, type = "wander") {
  const speed = { wander: -58, hopper: -72, flyer: -88, charger: -96, sentry: -38 }[type] || -58;
  return { x, y, baseY: y, w: type === "flyer" ? 42 : 38, h: type === "flyer" ? 28 : 34, vx: speed, vy: 0, min, max, type, alive: true, squash: 0, phase: rand(0, TAU), charge: rand(0.4, 1.4) };
}

function makePower(x, y, type = "shield") {
  const mobile = ["boots", "mushroom", "star"].includes(type);
  return { x, y, w: type === "mushroom" ? 36 : 32, h: 32, vx: mobile ? 46 : 0, vy: 0, type, phase: rand(0, TAU), taken: false };
}

function createLevel(index) {
  const second = index === 1;
  const secret = index === 2;
  const width = secret ? 2800 : second ? 7200 : 6200;
  const groundY = 624;
  const ground = secret
    ? [[0, width]]
    : second
    ? [[0, 720], [880, 1550], [1720, 2380], [2550, 3360], [3540, 4310], [4500, 5200], [5450, width]]
    : [[0, 950], [1100, 1660], [1820, 2580], [2760, 3460], [3660, 4380], [4580, width]];
  const platforms = ground.map(([x, end]) => ({ x, y: groundY, w: end - x, h: H - groundY, kind: "ground" }));
  const blocks = [];
  const coins = [];
  const enemies = [];
  const powers = [];
  const storyEvents = [];

  const addPlatform = (x, y, count, kind = "stone") => {
    for (let i = 0; i < count; i += 1) platforms.push({ x: x + i * TILE, y, w: TILE, h: TILE, kind });
  };
  const addCoins = (x, y, count, gap = 42) => {
    for (let i = 0; i < count; i += 1) coins.push(makeCoin(x + i * gap, y + Math.sin(i * 0.9) * 12));
  };
  const addBrickRun = (x, y, count, contents = {}) => {
    for (let i = 0; i < count; i += 1) blocks.push(makeBlock(x + i * TILE, y, "brick", contents[i] || null));
  };
  const addMysterySet = (items) => {
    items.forEach(([x, y, contents]) => blocks.push(makeBlock(x, y, "mystery", contents)));
  };

  if (secret) {
    addPlatform(430, 500, 4, "grass");
    addPlatform(900, 430, 5, "stone");
    addPlatform(1450, 355, 4, "grass");
    addPlatform(2020, 455, 5, "stone");
    addBrickRun(300, 428, 5, { 1: "coin", 4: "mushroom" });
    addBrickRun(820, 354, 6, { 2: "fire" });
    addBrickRun(1350, 278, 5, { 3: "star" });
    addBrickRun(1960, 382, 7, { 1: "coin", 5: "spark" });
    [
      [520, 392, "coin"], [568, 392, "mushroom"], [616, 392, "coin"],
      [1050, 322, "fire"], [1098, 322, "coin"],
      [1570, 250, "spark"], [1618, 250, "coin"], [1666, 250, "coin"],
      [2140, 347, "fire"], [2188, 347, "coin"],
    ].forEach(([x, y, contents], i) => blocks.push(makeBlock(x, y, i % 2 ? "mystery" : "brick", contents)));
    addCoins(240, 540, 8);
    addCoins(455, 445, 5);
    addCoins(910, 374, 7);
    addCoins(1440, 306, 8);
    addCoins(2025, 402, 7);
    enemies.push(makeEnemy(1280, groundY - 34, 1180, 1420, "hopper"));
    enemies.push(makeEnemy(1720, 280, 1500, 1980, "flyer"));
    enemies.push(makeEnemy(2220, 455 - 34, 2020, 2260, "sentry"));
    powers.push(makePower(760, 542, "mushroom"));
    storyEvents.push({ x: 880, type: "gift", done: false }, { x: 1620, type: "ambush", done: false });
    return {
      name: "1-S Secret Star Pipe",
      width,
      groundY,
      start: { x: 120, y: 480 },
      checkpoint: { x: 1320, y: groundY - 110, w: 26, h: 110, lit: false },
      finish: { x: width - 300, y: groundY - 120, w: 86, h: 120, kind: "pipeExit" },
      platforms,
      blocks,
      coins,
      enemies,
      powers,
      storyEvents,
      secretEntrance: null,
      clouds: Array.from({ length: 7 }, (_, i) => ({ x: i * 390 + rand(30, 170), y: rand(60, 210), s: rand(0.65, 1.15) })),
    };
  }

  addPlatform(520, 476, 4, "grass");
  addPlatform(1320, 430, 4, "stone");
  addPlatform(2050, 504, 3, "grass");
  addPlatform(2380, 392, 4, "stone");
  addPlatform(3060, 476, 5, "grass");
  addPlatform(3910, 430, 4, "stone");
  addPlatform(4930, 500, 4, "grass");
  if (second) {
    addPlatform(980, 402, 4, "stone");
    addPlatform(2860, 356, 3, "grass");
    addPlatform(5200, 392, 5, "stone");
    addPlatform(6100, 455, 4, "grass");
  }

  if (!second) {
    addPlatform(960, 540, 3, "grass");
    addPlatform(1710, 548, 3, "grass");
    addPlatform(2780, 520, 3, "grass");
    addPlatform(3540, 454, 3, "stone");
    addPlatform(4480, 454, 4, "grass");
    addPlatform(5330, 430, 3, "stone");
    addBrickRun(620, 432, 5, { 2: "coin" });
    addBrickRun(1120, 382, 4, { 1: "mushroom" });
    addBrickRun(1880, 438, 5, { 3: "coin" });
    addBrickRun(2860, 374, 6, { 0: "coin", 5: "fire" });
    addBrickRun(3600, 360, 5, { 2: "star" });
    addBrickRun(4700, 392, 6, { 1: "coin", 4: "fire" });
    addMysterySet([[1010, 446, "boots"], [1770, 404, "coin"], [3340, 314, "mushroom"], [5150, 334, "spark"]]);
  } else {
    addPlatform(760, 520, 3, "grass");
    addPlatform(1640, 500, 4, "stone");
    addPlatform(2460, 458, 3, "grass");
    addPlatform(3740, 370, 3, "stone");
    addPlatform(4630, 402, 3, "grass");
    addPlatform(5860, 350, 4, "stone");
    addBrickRun(900, 350, 5, { 3: "fire" });
    addBrickRun(1780, 404, 6, { 1: "coin", 4: "mushroom" });
    addBrickRun(2600, 312, 5, { 2: "star" });
    addBrickRun(3920, 292, 6, { 1: "coin", 5: "fire" });
    addBrickRun(5540, 300, 7, { 3: "spark" });
    addMysterySet([[740, 430, "mushroom"], [2360, 362, "boots"], [4300, 316, "fire"], [6280, 314, "star"]]);
  }

  [
    [720, 384, "coin"], [768, 384, "mushroom"], [816, 384, "coin"],
    [1500, 338, "fire"], [1548, 338, "coin"],
    [2520, 300, "spark"], [2568, 300, "coin"], [2616, 300, "coin"],
    [4080, 338, "fire"], [4128, 338, "coin"],
  ].forEach(([x, y, contents], i) => blocks.push(makeBlock(x, y, i % 2 ? "mystery" : "brick", contents)));
  if (second) {
    [[1060, 310, "spark"], [2980, 264, "fire"], [5340, 300, "mushroom"], [5388, 300, "coin"]]
      .forEach(([x, y, contents]) => blocks.push(makeBlock(x, y, "mystery", contents)));
  }

  addCoins(360, 540, 6);
  addCoins(590, 420, 5);
  addCoins(1310, 374, 5);
  addCoins(2040, 450, 4);
  addCoins(2370, 336, 6);
  addCoins(3070, 420, 6);
  addCoins(3920, 374, 5);
  addCoins(4920, 444, 5);
  if (second) {
    addCoins(1000, 350, 5);
    addCoins(2840, 304, 5);
    addCoins(5200, 338, 7);
    addCoins(6100, 402, 6);
  }

  enemies.push(makeEnemy(1220, groundY - 34, 1120, 1600));
  enemies.push(makeEnemy(1360, 430 - 34, 1320, 1510));
  enemies.push(makeEnemy(2180, groundY - 34, 1840, 2500, "hopper"));
  enemies.push(makeEnemy(2680, 330, 2460, 2940, "flyer"));
  enemies.push(makeEnemy(3220, 476 - 34, 3060, 3290));
  enemies.push(makeEnemy(3720, groundY - 34, 3600, 4300, "charger"));
  enemies.push(makeEnemy(4140, groundY - 34, 3680, 4350, "hopper"));
  enemies.push(makeEnemy(4680, 454 - 34, 4480, 4660, "sentry"));
  enemies.push(makeEnemy(5100, groundY - 34, 4600, 5600));
  if (second) {
    enemies.push(makeEnemy(1180, 402 - 34, 980, 1150, "hopper"));
    enemies.push(makeEnemy(1540, 310, 1320, 1780, "flyer"));
    enemies.push(makeEnemy(3000, 356 - 34, 2860, 3000));
    enemies.push(makeEnemy(4100, groundY - 34, 3900, 4560, "charger"));
    enemies.push(makeEnemy(5480, groundY - 34, 5450, 6100, "hopper"));
    enemies.push(makeEnemy(5920, 350 - 34, 5860, 6040, "sentry"));
    enemies.push(makeEnemy(6220, 455 - 34, 6100, 6250));
  }

  powers.push(makePower(1760, 542, "shield"));
  powers.push(makePower(3470, 542, "boots"));
  powers.push(makePower(4380, 542, "mushroom"));
  if (second) powers.push(makePower(4450, 542, "spark"));
  storyEvents.push(
    { x: second ? 1120 : 980, type: "ambush", done: false },
    { x: second ? 2700 : 2480, type: "gift", done: false },
    { x: second ? 5050 : 3860, type: "quake", done: false }
  );

  const secretEntrance = {
    x: second ? 4720 : 2820,
    y: groundY - 78,
    w: 74,
    h: 78,
    target: 2,
  };
  platforms.push({ x: secretEntrance.x, y: secretEntrance.y, w: secretEntrance.w, h: secretEntrance.h, kind: "pipe" });

  return {
    name: second ? "1-2 星霧高塔" : "1-1 星塵草原",
    width,
    groundY,
    start: { x: 120, y: 480 },
    checkpoint: { x: second ? 3480 : 3000, y: groundY - 110, w: 26, h: 110, lit: false },
    finish: { x: width - 260, y: groundY - 168, w: 70, h: 168 },
    platforms,
    blocks,
    coins,
    enemies,
    powers,
    storyEvents,
    secretEntrance,
    clouds: Array.from({ length: 10 }, (_, i) => ({ x: i * 650 + rand(30, 220), y: rand(58, 220), s: rand(0.65, 1.2) })),
  };
}

function resetGame() {
  startAudio();
  state.mode = "playing";
  state.levelIndex = 0;
  state.score = 0;
  state.coins = 0;
  state.lives = 3;
  state.secretReturn = null;
  state.frameAccumulator = 0;
  loadLevel(0);
  hideOverlays();
  updateUi();
}

function loadLevel(index) {
  state.levelIndex = index;
  state.world = createLevel(index);
  state.player = createPlayer(state.world.start.x, state.world.start.y);
  state.camera.x = 0;
  state.camera.y = 0;
  state.frameAccumulator = 0;
  state.timer = index === 2 ? 150 : index === 0 ? 300 : 360;
  state.checkpoint = null;
  state.fireballs = [];
  state.particles = [];
  state.floaters = [];
  state.rings = [];
  state.flash = 0.28;
  updateUi();
}

function hideOverlays() {
  ui.startOverlay.classList.remove("active");
  ui.levelOverlay.classList.remove("active");
  ui.gameOverOverlay.classList.remove("active");
}

function getSolids() {
  return [...state.world.platforms, ...state.world.blocks.filter((b) => !(b.kind === "brick" && b.used))];
}

function update(dt) {
  if (state.mode !== "playing") {
    updateEffects(dt);
    return;
  }
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer <= 0) hurtPlayer("時間耗盡");
  updatePlayer(dt);
  updateFireballs(dt);
  updateBlocks(dt);
  updateEnemies(dt);
  updatePowers(dt);
  checkStoryEvents();
  collectCoins();
  collectPowerups();
  checkSecretEntrance();
  checkEnemyHits();
  checkCheckpointAndFinish();
  updateCamera(dt);
  updateEffects(dt);
  updateUi();
}

function checkStoryEvents() {
  const events = state.world.storyEvents || [];
  const p = state.player;
  events.forEach((event) => {
    if (event.done || p.x < event.x) return;
    event.done = true;
    if (event.type === "gift") {
      const type = state.levelIndex === 2 || state.levelIndex === 1 ? "star" : "fire";
      state.world.powers.push(makePower(p.x + 160, Math.max(160, p.y - 120), type));
      addFloater("SKY DROP", p.x + 130, p.y - 140, colors.yellow);
      addRing(p.x + 160, p.y - 100, colors.yellow, 130);
      playSfx("power");
    }
    if (event.type === "ambush") {
      state.world.enemies.push(makeEnemy(p.x + 360, Math.max(170, p.y - 180), p.x + 180, p.x + 560, "flyer"));
      state.world.enemies.push(makeEnemy(p.x + 520, state.world.groundY - 34, p.x + 360, p.x + 720, "charger"));
      addFloater("AMBUSH", p.x + 220, p.y - 95, colors.coral);
      addParticle(p.x + 300, p.y - 80, colors.coral, 32, 260, 4);
      state.screenShake = 7;
      playSfx("hurt");
    }
    if (event.type === "quake") {
      state.world.blocks.push(makeBlock(p.x + 260, 360, "mystery", "mushroom"));
      state.world.blocks.push(makeBlock(p.x + 308, 360, "brick", "coin"));
      addFloater("星磚重組", p.x + 260, 330, colors.cyan);
      addRing(p.x + 300, 390, colors.cyan, 180);
      state.screenShake = 10;
      playSfx("bump");
    }
  });
}

function inputAxis() {
  const left = state.keys.has("a") || state.keys.has("arrowleft") || state.touch.left;
  const right = state.keys.has("d") || state.keys.has("arrowright") || state.touch.right;
  return (right ? 1 : 0) - (left ? 1 : 0);
}

function dashHeld() {
  return state.keys.has("shift") || state.keys.has("c") || state.touch.dash;
}

function downHeld() {
  return state.keys.has("s") || state.keys.has("arrowdown") || state.keys.has("v") || state.touch.down;
}

function updatePlayer(dt) {
  const p = state.player;
  const axis = inputAxis();
  const maxSpeed = dashHeld() ? 620 : 430;
  const accel = p.grounded ? 3100 : 2050;
  const friction = p.grounded ? 2400 : 620;
  if (axis !== 0) {
    p.vx += axis * accel * dt;
    p.facing = axis;
  } else {
    const slow = Math.min(Math.abs(p.vx), friction * dt);
    p.vx -= Math.sign(p.vx) * slow;
  }
  p.vx = clamp(p.vx, -maxSpeed, maxSpeed);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.grounded ? 0.11 : Math.max(0, p.coyote - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.powerTime = Math.max(0, p.powerTime - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.dashSound = Math.max(0, p.dashSound - dt);
  if (dashHeld() && p.grounded && Math.abs(p.vx) > 330 && p.dashSound <= 0) {
    p.dashSound = 0.22;
    playSfx("dash");
  }
  p.starTime = Math.max(0, p.starTime - dt);
  if (p.powerTime <= 0 && !["shield", "mushroom"].includes(p.power)) p.power = "none";
  if (p.starTime > 0 && chance(dt * 16)) {
    addParticle(p.x + rand(0, p.w), p.y + rand(0, p.h), [colors.yellow, colors.cyan, colors.violet, colors.coral][Math.floor(rand(0, 4))], 2, 80, 2);
  }
  if (state.jumpQueued) {
    p.jumpBuffer = 0.12;
    state.jumpQueued = false;
  }
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    playSfx("jump");
    p.vy = p.power === "boots" ? -1130 : -980;
    p.grounded = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    addParticle(p.x + p.w / 2, p.y + p.h, colors.cyan, 22, 240, 3);
    addRing(p.x + p.w / 2, p.y + p.h, colors.cyan, 95);
  }
  p.vy += GRAVITY * dt;
  p.vy = Math.min(p.vy, 1200);

  p.wasGrounded = p.grounded;
  moveAndCollide(p, dt);
  if (!p.wasGrounded && p.grounded) {
    p.landSquash = 0.2;
    playSfx("land");
    addParticle(p.x + p.w / 2, p.y + p.h, "rgba(255,230,90,0.75)", 10, 95, 2);
  }
  p.anim += dt * (Math.abs(p.vx) * 0.045 + (p.grounded ? 3 : 1));
  p.landSquash = Math.max(0, p.landSquash - dt * 3.8);
  p.runDust -= dt;
  if (p.grounded && Math.abs(p.vx) > 210 && p.runDust <= 0) {
    p.runDust = 0.07;
    addParticle(p.x + p.w / 2 - p.facing * 16, p.y + p.h - 3, "rgba(255,230,90,0.85)", 4, 80, 2);
  }
  if (p.y > H + 220) hurtPlayer("掉出地圖");
}

function shootFireball() {
  const p = state.player;
  if (state.mode !== "playing" || !p || p.power !== "fire" || p.fireCooldown > 0) return;
  if (state.fireballs.length >= 3) state.fireballs.shift();
  p.fireCooldown = 0.32;
  state.fireballs.push({
    x: p.x + p.w / 2 + p.facing * 24,
    y: p.y + 22,
    r: 9,
    vx: p.facing * 560,
    vy: -90,
    life: 2.6,
    bounces: 0,
  });
  addParticle(p.x + p.w / 2 + p.facing * 28, p.y + 22, colors.coral, 8, 150, 2);
  playSfx("fire");
}

function updateFireballs(dt) {
  for (const ball of state.fireballs) {
    ball.life -= dt;
    ball.vy += GRAVITY * 0.72 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const box = { x: ball.x - ball.r, y: ball.y - ball.r, w: ball.r * 2, h: ball.r * 2 };
    for (const solid of getSolids()) {
      if (!rectsOverlap(box, solid)) continue;
      if (solid.kind === "brick" && !solid.contents) {
        solid.used = true;
        ball.life = 0;
        state.score += 40;
        addParticle(solid.x + solid.w / 2, solid.y + solid.h / 2, colors.brick, 16, 220, 3);
        playSfx("break");
        break;
      }
      if (ball.vy > 0 && box.y + box.h - solid.y < 24) {
        ball.y = solid.y - ball.r;
        ball.vy = -420;
        ball.bounces += 1;
      } else {
        ball.life = 0;
      }
      addParticle(ball.x, ball.y, colors.coral, 5, 100, 2);
      break;
    }
    for (const enemy of state.world.enemies) {
      if (!enemy.alive || !rectsOverlap(box, enemy)) continue;
      enemy.alive = false;
      enemy.squash = 0.35;
      ball.life = 0;
      state.score += 180;
      addFloater("+180", enemy.x + enemy.w / 2, enemy.y, colors.coral);
      addParticle(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.coral, 18, 230, 3);
      addRing(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.coral, 76);
      playSfx("stomp");
      break;
    }
  }
  state.fireballs = state.fireballs.filter((ball) => ball.life > 0 && ball.x > state.camera.x - 80 && ball.x < state.camera.x + W + 80 && ball.bounces < 8);
}

function moveAndCollide(obj, dt) {
  obj.x += obj.vx * dt;
  for (const solid of getSolids()) {
    if (!rectsOverlap(obj, solid)) continue;
    if (obj.vx > 0) obj.x = solid.x - obj.w;
    else if (obj.vx < 0) obj.x = solid.x + solid.w;
    obj.vx = 0;
  }

  obj.y += obj.vy * dt;
  obj.grounded = false;
  for (const solid of getSolids()) {
    if (!rectsOverlap(obj, solid)) continue;
    if (obj.vy > 0) {
      obj.y = solid.y - obj.h;
      obj.vy = 0;
      obj.grounded = true;
    } else if (obj.vy < 0) {
      obj.y = solid.y + solid.h;
      obj.vy = 0;
      if (solid.kind === "mystery" || solid.kind === "brick") bumpBlock(solid);
    }
  }
}

function bumpBlock(block) {
  if (block.bump > 0.01) return;
  block.bump = 1;
  playSfx("bump");
  addRing(block.x + block.w / 2, block.y + block.h / 2, block.kind === "mystery" ? colors.yellow : colors.brick, 58);
  addParticle(block.x + block.w / 2, block.y, block.kind === "mystery" ? colors.yellow : colors.brick, 8, 110, 2);
  if (block.kind === "brick" && (!block.contents || state.player.big || state.player.starTime > 0 || ["spark", "fire", "mushroom"].includes(state.player.power))) {
    block.used = true;
    state.score += 75;
    addFloater("+75", block.x + block.w / 2, block.y, colors.coral);
    releaseBlockContents(block);
    addParticle(block.x + block.w / 2, block.y + block.h / 2, colors.brick, 20, 240, 4);
    playSfx("break");
    return;
  }
  if (block.kind !== "mystery" || block.used) return;
  block.used = true;
  releaseBlockContents(block);
}

function releaseBlockContents(block) {
  if (!block.contents) return;
  const content = block.contents;
  block.contents = null;
  if (content === "coin") {
    state.score += 100;
    state.coins += 1;
    addFloater("+100", block.x + block.w / 2, block.y - 12, colors.yellow);
    addParticle(block.x + block.w / 2, block.y, colors.yellow, 16, 170, 3);
    playSfx("coin");
  } else {
    state.world.powers.push(makePower(block.x + 8, block.y - 38, content));
    addFloater("道具", block.x + block.w / 2, block.y - 10, colors.cyan);
  }
}

function updateBlocks(dt) {
  state.world.blocks.forEach((block) => {
    block.bump = Math.max(0, block.bump - dt * 5);
  });
}

function updateEnemies(dt) {
  state.world.enemies.forEach((enemy) => {
    if (!enemy.alive) {
      enemy.squash -= dt;
      return;
    }
    enemy.phase += dt * 5;
    if (enemy.type === "flyer") {
      enemy.x += enemy.vx * dt;
      enemy.y = enemy.baseY + Math.sin(enemy.phase * 1.4) * 34;
      if (enemy.x < enemy.min || enemy.x + enemy.w > enemy.max) {
        enemy.vx *= -1;
        enemy.x = clamp(enemy.x, enemy.min, enemy.max - enemy.w);
      }
      return;
    }
    if (enemy.type === "charger") {
      enemy.charge -= dt;
      const toward = Math.sign((state.player?.x || enemy.x) - enemy.x) || Math.sign(enemy.vx) || 1;
      if (enemy.charge <= 0) {
        enemy.vx = toward * 210;
        enemy.charge = rand(1.2, 2.4);
        addParticle(enemy.x + enemy.w / 2, enemy.y + enemy.h, colors.red, 4, 90, 2);
      }
    }
    if (enemy.type === "sentry") {
      enemy.vx += Math.sin(enemy.phase * 0.4) * 2.5;
      enemy.vx = clamp(enemy.vx, -54, 54);
    }
    if (enemy.type === "hopper" && enemy.vy === 0 && chance(dt * 0.55)) enemy.vy = -620;
    enemy.vy += GRAVITY * dt;
    enemy.x += enemy.vx * dt;
    if (enemy.x < enemy.min || enemy.x + enemy.w > enemy.max) {
      enemy.vx *= -1;
      enemy.x = clamp(enemy.x, enemy.min, enemy.max - enemy.w);
    }
    enemy.y += enemy.vy * dt;
    for (const solid of getSolids()) {
      if (!rectsOverlap(enemy, solid)) continue;
      if (enemy.vy > 0) {
        enemy.y = solid.y - enemy.h;
        enemy.vy = 0;
      } else if (enemy.vy < 0) {
        enemy.y = solid.y + solid.h;
        enemy.vy = 0;
      }
    }
  });
  state.world.enemies = state.world.enemies.filter((enemy) => enemy.alive || enemy.squash > 0);
}

function updatePowers(dt) {
  state.world.powers.forEach((power) => {
    if (power.taken) return;
    power.phase += dt * 5;
    power.vy += GRAVITY * dt;
    power.x += power.vx * dt;
    for (const solid of getSolids()) {
      if (!rectsOverlap(power, solid)) continue;
      if (power.vx > 0) power.x = solid.x - power.w;
      else if (power.vx < 0) power.x = solid.x + solid.w;
      power.vx *= -1;
    }
    power.y += power.vy * dt;
    for (const solid of getSolids()) {
      if (!rectsOverlap(power, solid)) continue;
      if (power.vy > 0) {
        power.y = solid.y - power.h;
        power.vy = 0;
      } else if (power.vy < 0) {
        power.y = solid.y + solid.h;
        power.vy = 0;
      }
    }
  });
  state.world.powers = state.world.powers.filter((p) => !p.taken);
}

function collectCoins() {
  const p = state.player;
  state.world.coins.forEach((coin) => {
    if (coin.taken || !rectsOverlap(p, coin)) return;
    coin.taken = true;
    state.coins += 1;
    state.score += 120;
    addFloater("+120", coin.x + coin.w / 2, coin.y, colors.yellow);
    addParticle(coin.x + coin.w / 2, coin.y + coin.h / 2, colors.yellow, 16, 180, 3);
    addRing(coin.x + coin.w / 2, coin.y + coin.h / 2, colors.yellow, 54);
    playSfx("coin");
    if (state.coins > 0 && state.coins % 50 === 0) {
      state.lives += 1;
      addFloater("1UP", p.x + p.w / 2, p.y - 20, colors.green);
    }
  });
}

function collectPowerups() {
  const p = state.player;
  state.world.powers.forEach((power) => {
    if (power.taken || !rectsOverlap(p, power)) return;
    power.taken = true;
    applyPower(power.type);
    addParticle(power.x + power.w / 2, power.y + power.h / 2, powerColor(power.type), 24, 220, 4);
    addRing(power.x + power.w / 2, power.y + power.h / 2, powerColor(power.type), 72);
  });
}

function applyPower(type) {
  const p = state.player;
  if (type === "shield") {
    p.power = "shield";
    p.powerTime = 999;
    addFloater("護盾", p.x + p.w / 2, p.y - 20, colors.blue);
  }
  if (type === "boots") {
    p.power = "boots";
    p.powerTime = 16;
    addFloater("跳靴", p.x + p.w / 2, p.y - 20, colors.green);
  }
  if (type === "spark") {
    p.power = "spark";
    p.powerTime = 14;
    addFloater("破磚火花", p.x + p.w / 2, p.y - 20, colors.coral);
  }
  if (type === "mushroom") {
    p.power = "mushroom";
    p.powerTime = 999;
    if (!p.big) {
      p.big = true;
      p.y -= 14;
      p.w = 42;
      p.h = 68;
    }
    addFloater("POWER UP", p.x + p.w / 2, p.y - 20, colors.green);
  }
  if (type === "fire") {
    p.power = "fire";
    p.powerTime = 22;
    addFloater("FIRE FLOWER", p.x + p.w / 2, p.y - 20, colors.coral);
  }
  if (type === "star") {
    p.starTime = 8.5;
    p.power = "star";
    p.powerTime = 8.5;
    addFloater("STAR POWER", p.x + p.w / 2, p.y - 20, colors.yellow);
    playSfx("star");
  }
  state.score += 250;
  playSfx("power");
}

function powerColor(type) {
  return { shield: colors.blue, boots: colors.green, spark: colors.coral, mushroom: colors.green, fire: colors.coral, star: colors.yellow }[type] || colors.white;
}

function checkEnemyHits() {
  const p = state.player;
  for (const enemy of state.world.enemies) {
    if (!enemy.alive || !rectsOverlap(p, enemy)) continue;
    if (p.starTime > 0) {
      enemy.alive = false;
      enemy.squash = 0.28;
      state.score += 250;
      addFloater("+250", enemy.x + enemy.w / 2, enemy.y, colors.yellow);
      addParticle(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.yellow, 24, 260, 4);
      addRing(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.yellow, 85);
      playSfx("stomp");
      continue;
    }
    const stomp = p.vy > 120 && p.y + p.h - enemy.y < 24;
    if (stomp) {
      enemy.alive = false;
      enemy.squash = 0.35;
      p.vy = p.power === "boots" ? -620 : -520;
      state.score += 200;
      addFloater("+200", enemy.x + enemy.w / 2, enemy.y, colors.yellow);
      addParticle(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.coral, 20, 230, 3);
      addRing(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, colors.yellow, 75);
      playSfx("stomp");
      state.screenShake = 4;
    } else {
      hurtPlayer("碰到敵人");
      break;
    }
  }
}

function checkSecretEntrance() {
  const entrance = state.world.secretEntrance;
  if (!entrance || !downHeld()) return;
  const p = state.player;
  const entryZone = { x: entrance.x - 12, y: entrance.y - 8, w: entrance.w + 24, h: entrance.h + 18 };
  if (!rectsOverlap(p, entryZone) || !p.grounded) return;
  enterSecretLevel(entrance.target);
}

function enterSecretLevel(target) {
  if (state.mode !== "playing") return;
  const carry = {
    power: state.player.power,
    powerTime: state.player.powerTime,
    starTime: state.player.starTime,
    big: state.player.big,
  };
  state.secretReturn = Math.min(1, state.levelIndex + 1);
  state.score += 300;
  playSfx("secret");
  loadLevel(target);
  Object.assign(state.player, carry);
  if (state.player.big) {
    state.player.w = 42;
    state.player.h = 68;
    state.player.y = Math.min(state.player.y, state.world.groundY - state.player.h);
  }
  addFloater("SECRET PIPE", state.player.x + state.player.w / 2, state.player.y - 28, colors.cyan);
  addRing(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, colors.cyan, 130);
}

function checkCheckpointAndFinish() {
  const p = state.player;
  const cp = state.world.checkpoint;
  if (!cp.lit && rectsOverlap(p, cp)) {
    cp.lit = true;
    state.checkpoint = { x: cp.x + 32, y: state.world.groundY - p.h - 4 };
    state.score += 500;
    addFloater("CHECKPOINT", cp.x + 20, cp.y - 18, colors.cyan);
    addParticle(cp.x + 12, cp.y + 20, colors.cyan, 30, 260, 4);
    addRing(cp.x + 12, cp.y + 32, colors.cyan, 120);
    playSfx("checkpoint");
  }
  if (rectsOverlap(p, state.world.finish)) {
    finishLevel();
  }
}

function hurtPlayer(reason) {
  const p = state.player;
  if (p.invuln > 0 || state.mode !== "playing") return;
  if (p.starTime > 0) return;
  if (p.power === "shield") {
    p.power = "none";
    p.powerTime = 0;
    p.invuln = 1.6;
    p.vy = -420;
    p.vx = -p.facing * 260;
    addFloater("護盾破裂", p.x + p.w / 2, p.y, colors.blue);
    addParticle(p.x + p.w / 2, p.y + p.h / 2, colors.blue, 34, 260, 4);
    addRing(p.x + p.w / 2, p.y + p.h / 2, colors.blue, 100);
    playSfx("shield");
    state.screenShake = 8;
    return;
  }
  if (p.big) {
    p.big = false;
    p.w = p.baseW;
    p.h = p.baseH;
    p.power = "none";
    p.powerTime = 0;
    p.invuln = 1.8;
    p.vy = -360;
    p.vx = -p.facing * 220;
    addFloater("SMALL", p.x + p.w / 2, p.y - 18, colors.yellow);
    addParticle(p.x + p.w / 2, p.y + p.h / 2, colors.yellow, 28, 240, 4);
    addRing(p.x + p.w / 2, p.y + p.h / 2, colors.yellow, 90);
    playSfx("hurt");
    state.screenShake = 7;
    return;
  }
  state.lives -= 1;
  state.screenShake = 10;
  state.flash = 0.45;
  addParticle(p.x + p.w / 2, p.y + p.h / 2, colors.coral, 44, 290, 5);
  addRing(p.x + p.w / 2, p.y + p.h / 2, colors.coral, 130);
  playSfx("hurt");
  if (state.lives < 0) {
    endGame(reason);
    return;
  }
  respawnPlayer();
}

function respawnPlayer() {
  const p = state.player;
  const spawn = state.checkpoint || state.world.start;
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.invuln = 2.2;
  p.power = "none";
  p.powerTime = 0;
  p.starTime = 0;
  p.big = false;
  p.w = p.baseW;
  p.h = p.baseH;
  state.fireballs = [];
  state.camera.x = clamp(p.x - W * 0.32, 0, state.world.width - W);
  addFloater("復活", p.x + p.w / 2, p.y - 25, colors.white);
}

function finishLevel() {
  if (state.mode !== "playing") return;
  state.mode = "levelClear";
  const timeBonus = Math.round(state.timer) * 8;
  state.score += timeBonus + 1200;
  state.levelAction = state.levelIndex === 2 ? "return" : state.levelIndex < 1 ? "next" : "restart";
  ui.levelOverlay.classList.add("active");
  ui.levelLabel.textContent = state.levelIndex === 2 ? "SECRET CLEAR" : state.levelIndex < 1 ? "COURSE CLEAR" : "ADVENTURE CLEAR";
  ui.levelTitle.textContent = state.levelIndex < 1 ? "關卡突破" : "星塵群島通關";
  if (state.levelIndex === 2) ui.levelTitle.textContent = "秘密通道完成";
  ui.levelText.textContent = `時間獎勵 ${timeBonus}，目前分數 ${state.score.toLocaleString()}。`;
  ui.levelButton.textContent = state.levelIndex < 1 ? "進入 1-2" : "重新挑戰";
  if (state.levelIndex === 2) ui.levelButton.textContent = "回到主線";
  state.flash = 0.42;
  addRing(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, colors.yellow, 190);
  playSfx("finish");
}

function nextLevelAction() {
  if (state.levelAction === "return") {
    ui.levelOverlay.classList.remove("active");
    state.mode = "playing";
    loadLevel(state.secretReturn ?? 1);
  } else if (state.levelAction === "next") {
    ui.levelOverlay.classList.remove("active");
    state.mode = "playing";
    loadLevel(state.levelIndex + 1);
  } else {
    resetGame();
  }
}

function endGame(reason) {
  state.mode = "gameover";
  ui.gameOverTitle.textContent = reason;
  ui.gameOverText.textContent = `分數 ${state.score.toLocaleString()}｜星幣 ${state.coins}｜關卡 ${state.levelIndex + 1}`;
  ui.gameOverOverlay.classList.add("active");
}

function updateCamera(dt) {
  const p = state.player;
  const target = clamp(p.x - W * 0.36 + p.vx * 0.18, 0, state.world.width - W);
  state.camera.x += (target - state.camera.x) * Math.min(1, dt * 8.5);
}

function updateEffects(dt) {
  state.particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 400 * dt;
    p.vx *= 0.985;
  });
  state.particles = state.particles.filter((p) => p.life > 0);
  state.floaters.forEach((f) => {
    f.life -= dt;
    f.y += f.vy * dt;
  });
  state.floaters = state.floaters.filter((f) => f.life > 0);
  state.rings.forEach((ring) => {
    ring.t += dt;
  });
  state.rings = state.rings.filter((ring) => ring.t < ring.life);
  state.screenShake = Math.max(0, state.screenShake - dt * 16);
  state.flash = Math.max(0, state.flash - dt * 1.8);
}

function updateUi() {
  ui.score.textContent = state.score.toLocaleString();
  ui.coins.textContent = state.coins.toString();
  ui.lives.textContent = Math.max(0, state.lives).toString();
  ui.level.textContent = state.levelIndex === 2 ? "1-S" : `1-${state.levelIndex + 1}`;
  ui.timer.textContent = Math.ceil(state.timer).toString();
  ui.power.textContent = powerLabel(state.player?.power || "none");
  ui.checkpointStatus.textContent = state.world?.checkpoint.lit ? "已啟動" : "尚未啟動";
  ui.missionTitle.textContent = state.levelIndex === 0 ? "抵達終點門" : "突破星霧高塔";
  ui.missionText.textContent = state.player?.power === "boots"
    ? "跳靴啟動中，可以跳得更高。"
    : state.player?.power === "spark"
      ? "火花啟動中，頂磚可破壞普通星磚。"
      : "善用跳躍緩衝、土狼時間與衝刺通過缺口。";
  window.__runnerDiagnostics = {
    mode: state.mode,
    levelIndex: state.levelIndex,
    score: state.score,
    coins: state.coins,
    lives: state.lives,
    playerX: Math.round(state.player?.x || 0),
    cameraX: Math.round(state.camera.x),
  };
}

function powerLabel(power) {
  if (power === "mushroom") return "蘑菇";
  if (power === "fire") return "火焰花";
  if (power === "star") return "無敵星";
  return { none: "無", shield: "護盾", boots: "跳靴", spark: "火花" }[power] || "無";
}

function startAudio() {
  if (state.audio.enabled && state.audio.ctx?.state === "running") return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  if (!state.audio.ctx) {
    const ctxAudio = new AudioCtor();
    const compressor = ctxAudio.createDynamicsCompressor();
    const master = ctxAudio.createGain();
    const music = ctxAudio.createGain();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.gain.value = 0.28;
    music.gain.value = 0.15;
    music.connect(master);
    master.connect(compressor);
    compressor.connect(ctxAudio.destination);
    state.audio.ctx = ctxAudio;
    state.audio.master = master;
    state.audio.music = music;
  }
  state.audio.ctx.resume?.();
  state.audio.enabled = true;
  if (!state.audio.timer) {
    state.audio.timer = window.setInterval(scheduleMusic, 160);
  }
}

function scheduleMusic() {
  const audio = state.audio;
  if (!audio.ctx || audio.ctx.state !== "running") return;
  if (!["playing", "levelClear"].includes(state.mode)) return;
  const step = audio.step % 32;
  const now = audio.ctx.currentTime + 0.04;
  const melody = [659, 0, 784, 0, 880, 784, 659, 0, 587, 0, 659, 0, 740, 659, 587, 0];
  const bass = [196, 196, 247, 247, 220, 220, 262, 262];
  const sparkle = [1318, 0, 1174, 0, 1046, 0, 987, 0];
  const note = melody[step % melody.length];
  if (note) playTone(note, 0.13, "square", 0.045, now, audio.music);
  if (step % 4 === 0) playTone(bass[(step / 4) % bass.length], 0.22, "triangle", 0.06, now, audio.music);
  if (step % 4 === 2) playTone(sparkle[Math.floor(step / 4) % sparkle.length], 0.045, "sine", 0.025, now, audio.music);
  if (step % 8 === 6) playTone(1046, 0.06, "sine", 0.035, now, audio.music);
  audio.step += 1;
}

function playTone(freq, duration = 0.12, type = "sine", gainValue = 0.08, when = 0, destination = null) {
  const audio = state.audio;
  if (!audio.ctx || !audio.enabled) return;
  const ctxAudio = audio.ctx;
  const start = Number.isFinite(when) && when > 0 ? when : ctxAudio.currentTime;
  if (![freq, duration, gainValue, start].every(Number.isFinite)) return;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(destination || audio.master);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playNoise(duration = 0.12, gainValue = 0.08) {
  const audio = state.audio;
  if (!audio.ctx || !audio.enabled) return;
  const ctxAudio = audio.ctx;
  const buffer = ctxAudio.createBuffer(1, Math.floor(ctxAudio.sampleRate * duration), ctxAudio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = rand(-1, 1) * (1 - i / data.length);
  const source = ctxAudio.createBufferSource();
  const gain = ctxAudio.createGain();
  gain.gain.value = gainValue;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audio.master);
  source.start();
}

function playSfx(name) {
  if (!state.audio.enabled) return;
  const now = state.audio.ctx.currentTime;
  if (name === "jump") playTone(520, 0.1, "square", 0.08, now);
  if (name === "dash") playTone(180, 0.09, "sawtooth", 0.045, now);
  if (name === "fire") playTone(880, 0.08, "square", 0.07, now);
  if (name === "land") playNoise(0.045, 0.025);
  if (name === "coin") {
    playTone(880, 0.07, "sine", 0.08, now);
    playTone(1320, 0.09, "sine", 0.06, now + 0.055);
  }
  if (name === "bump") playTone(180, 0.08, "triangle", 0.07, now);
  if (name === "break") playNoise(0.16, 0.09);
  if (name === "power") {
    playTone(660, 0.08, "square", 0.08, now);
    playTone(990, 0.13, "square", 0.06, now + 0.07);
  }
  if (name === "stomp") playTone(240, 0.09, "sawtooth", 0.08, now);
  if (name === "shield") playTone(340, 0.18, "triangle", 0.08, now);
  if (name === "hurt") {
    playTone(220, 0.12, "sawtooth", 0.09, now);
    playNoise(0.12, 0.06);
  }
  if (name === "checkpoint") {
    [523, 659, 784].forEach((freq, i) => playTone(freq, 0.12, "sine", 0.07, now + i * 0.08));
  }
  if (name === "finish") {
    [523, 659, 784, 1046].forEach((freq, i) => playTone(freq, 0.16, "square", 0.075, now + i * 0.09));
  }
  if (name === "secret") {
    [392, 523, 784, 1175].forEach((freq, i) => playTone(freq, 0.11, "sine", 0.065, now + i * 0.07));
  }
  if (name === "star") {
    [523, 659, 784, 988, 1175, 1568].forEach((freq, i) => playTone(freq, 0.08, "square", 0.06, now + i * 0.045));
  }
}

function draw(now) {
  const shake = state.screenShake;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackground(now);
  ctx.save();
  ctx.translate(-state.camera.x, 0);
  drawWorld(now);
  drawEntities(now);
  drawRings();
  drawParticles();
  drawFloaters();
  ctx.restore();
  drawSpeedLines(now);
  drawVignette();
  ctx.restore();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,230,90,${state.flash * 0.18})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground(now) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, colors.skyTop);
  sky.addColorStop(0.58, colors.skyBottom);
  sky.addColorStop(1, "#fff0a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const world = state.world;
  const cam = state.camera.x;
  if (!world) return;
  world.clouds.forEach((cloud) => {
    drawCloud((cloud.x - cam * 0.18) % (W + 260) - 130, cloud.y, cloud.s);
  });
  drawHills(cam * 0.32, "#357b76", 0.48, 430, now);
  drawHills(cam * 0.55, "#25565f", 0.72, 510, now + 1000);
}

function drawSpeedLines(now) {
  const p = state.player;
  if (!p || state.mode === "start") return;
  const speed = Math.abs(p.vx);
  if (speed < 360) return;
  const alpha = clamp((speed - 360) / 300, 0, 1) * 0.18;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = p.power === "boots" ? colors.cyan : colors.yellow;
  ctx.lineWidth = 2;
  const dir = Math.sign(p.vx) || p.facing || 1;
  for (let i = 0; i < 16; i += 1) {
    const y = 95 + ((i * 43 + now * 0.08) % (H - 150));
    const x = ((i * 137 - state.camera.x * 0.3) % W + W) % W;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * (44 + speed * 0.04), y + 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.beginPath();
  ctx.arc(0, 18, 24, 0, TAU);
  ctx.arc(28, 6, 32, 0, TAU);
  ctx.arc(64, 18, 25, 0, TAU);
  ctx.fillRect(-4, 18, 74, 25);
  ctx.fill();
  ctx.restore();
}

function drawHills(offset, color, alpha, baseY, now) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = -120; x <= W + 160; x += 80) {
    const y = baseY + Math.sin((x + offset) * 0.007 + now * 0.0001) * 24 - Math.abs(Math.sin((x + offset) * 0.003)) * 95;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWorld(now) {
  const world = state.world;
  if (!world) return;
  world.platforms.forEach(drawPlatform);
  world.blocks.forEach((block) => drawBlock(block, now));
  world.coins.forEach((coin) => {
    if (!coin.taken) drawCoin(coin, now);
  });
  drawCheckpoint(world.checkpoint, now);
  drawFinish(world.finish, now);
}

function drawPlatform(platform) {
  if (platform.kind === "pipe") {
    drawPipe(platform.x, platform.y, platform.w, platform.h, colors.green);
    return;
  }
  const tileCount = Math.ceil(platform.w / TILE);
  for (let i = 0; i < tileCount; i += 1) {
    const x = platform.x + i * TILE;
    const w = Math.min(TILE, platform.x + platform.w - x);
    if (platform.kind === "ground") {
      ctx.fillStyle = colors.dirt;
      ctx.fillRect(x, platform.y, w, platform.h);
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, platform.y, w, 12);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 5, platform.y + 17, w - 10, 4);
    } else {
      ctx.fillStyle = platform.kind === "grass" ? colors.grass : "#78909f";
      roundRect(x + 2, platform.y + 2, w - 4, TILE - 4, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 7, platform.y + 9, w - 14, 5);
    }
  }
}

function drawBlock(block, now) {
  if (block.used && block.kind === "brick") return;
  const y = block.y - Math.sin(block.bump * Math.PI) * 8;
  ctx.save();
  ctx.translate(block.x, y);
  ctx.fillStyle = block.used ? "#5f6b72" : block.kind === "mystery" ? colors.yellow : colors.brick;
  ctx.shadowColor = block.kind === "mystery" && !block.used ? colors.yellow : "transparent";
  ctx.shadowBlur = block.kind === "mystery" && !block.used ? 14 : 0;
  roundRect(2, 2, TILE - 4, TILE - 4, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(6, TILE - 12, TILE - 12, 5);
  if (block.kind === "brick" && !block.used) {
    ctx.strokeStyle = block.contents ? "rgba(255,230,90,0.55)" : "rgba(70,35,20,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9, 15);
    ctx.lineTo(22, 24);
    ctx.lineTo(17, 36);
    ctx.moveTo(31, 10);
    ctx.lineTo(25, 22);
    ctx.lineTo(36, 34);
    ctx.stroke();
  }
  if (block.kind === "mystery" && !block.used) {
    ctx.fillStyle = "#563d12";
    ctx.font = "900 26px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("?", TILE / 2, 33 + Math.sin(now * 0.005) * 2);
  }
  ctx.restore();
}

function drawCoin(coin, now) {
  const cx = coin.x + coin.w / 2;
  const cy = coin.y + coin.h / 2;
  const scale = 0.45 + Math.abs(Math.sin(now * 0.006 + coin.phase)) * 0.55;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, 1);
  ctx.fillStyle = colors.yellow;
  ctx.shadowColor = colors.yellow;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 17, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 11, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawCheckpoint(cp, now) {
  ctx.fillStyle = "#4f3427";
  ctx.fillRect(cp.x, cp.y, 8, cp.h);
  ctx.fillStyle = cp.lit ? colors.cyan : "rgba(255,255,255,0.55)";
  ctx.shadowColor = cp.lit ? colors.cyan : "transparent";
  ctx.shadowBlur = cp.lit ? 16 : 0;
  ctx.beginPath();
  ctx.moveTo(cp.x + 8, cp.y + 8);
  ctx.lineTo(cp.x + 72, cp.y + 26 + Math.sin(now * 0.005) * 4);
  ctx.lineTo(cp.x + 8, cp.y + 48);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawFinish(finish, now) {
  if (finish.kind === "pipeExit") {
    drawPipe(finish.x, finish.y, finish.w, finish.h, colors.cyan);
    ctx.fillStyle = colors.yellow;
    ctx.font = "900 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("EXIT", finish.x + finish.w / 2, finish.y - 12 + Math.sin(now * 0.005) * 3);
    return;
  }
  ctx.fillStyle = "#4f3427";
  ctx.fillRect(finish.x + 28, finish.y, 14, finish.h);
  ctx.strokeStyle = colors.yellow;
  ctx.lineWidth = 4;
  ctx.shadowColor = colors.yellow;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(finish.x + 35, finish.y + 58, 36 + Math.sin(now * 0.004) * 3, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.cyan;
  ctx.fillRect(finish.x, finish.y + finish.h - 12, finish.w, 12);
}

function drawPipe(x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  roundRect(x + 8, y + 10, w - 16, h - 10, 8);
  ctx.fill();
  roundRect(x, y, w, 24, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(x + 14, y + 10, 8, h - 18);
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(x + w - 20, y + 12, 7, h - 20);
  ctx.restore();
}

function drawEntities(now) {
  const world = state.world;
  world.powers.forEach((power) => drawPower(power, now));
  world.enemies.forEach((enemy) => drawEnemy(enemy, now));
  drawFireballs();
  drawPlayer(state.player, now);
}

function drawPower(power, now) {
  if (power.taken) return;
  const color = powerColor(power.type);
  ctx.save();
  ctx.translate(power.x + power.w / 2, power.y + power.h / 2);
  ctx.rotate(Math.sin(power.phase) * 0.12);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  roundRect(-16, -16, 32, 32, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.dark;
  ctx.font = "900 16px Inter, sans-serif";
  ctx.textAlign = "center";
  const letter = { shield: "S", boots: "B", spark: "F", mushroom: "M", fire: "F", star: "*" }[power.type] || "?";
  ctx.fillText(letter, 0, 6);
  ctx.restore();
}

function drawFireballs() {
  state.fireballs.forEach((ball) => {
    const alpha = clamp(ball.life / 2.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors.coral;
    ctx.shadowColor = colors.coral;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = colors.yellow;
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y - 2, ball.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  });
}

function drawEnemy(enemy, now) {
  const squash = enemy.alive ? 1 : 0.45;
  ctx.save();
  ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h);
  ctx.scale(1, squash);
  ctx.fillStyle = {
    hopper: colors.violet,
    flyer: colors.blue,
    charger: colors.red,
    sentry: colors.yellow,
  }[enemy.type] || colors.coral;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 13;
  if (enemy.type === "flyer") {
    ctx.beginPath();
    ctx.ellipse(0, -enemy.h / 2, enemy.w / 2, enemy.h / 2, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(-22, -enemy.h / 2 + Math.sin(now * 0.02) * 4, 17, 8, -0.3, 0, TAU);
    ctx.ellipse(22, -enemy.h / 2 - Math.sin(now * 0.02) * 4, 17, 8, 0.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    roundRect(-enemy.w / 2, -enemy.h, enemy.w, enemy.h, enemy.type === "charger" ? 6 : 10);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.white;
  ctx.beginPath();
  ctx.arc(-8, -21, 4, 0, TAU);
  ctx.arc(8, -21, 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(-7 + Math.sign(enemy.vx) * 1.5, -21, 1.8, 0, TAU);
  ctx.arc(9 + Math.sign(enemy.vx) * 1.5, -21, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(p, now) {
  const blink = p.invuln > 0 && Math.floor(now / 90) % 2 === 0;
  if (blink) return;
  const cx = p.x + p.w / 2;
  const starColor = `hsl(${Math.floor((now * 0.18) % 360)}, 96%, 64%)`;
  const color = p.starTime > 0 ? starColor : p.power === "spark" || p.power === "fire" ? colors.coral : p.power === "boots" || p.power === "mushroom" ? colors.green : colors.cyan;
  const run = Math.min(1, Math.abs(p.vx) / 430);
  const step = Math.sin(p.anim);
  const bob = p.grounded ? Math.abs(step) * 3 * run : 0;
  const squashX = 1 + p.landSquash * 0.28 + (p.vy > 500 ? 0.08 : 0);
  const squashY = 1 - p.landSquash * 0.22 + (p.vy < -250 ? 0.06 : 0);
  ctx.save();
  ctx.translate(cx, p.y + p.h + bob);
  ctx.scale(p.facing, 1);
  if (p.big) ctx.scale(1.16, 1.16);
  ctx.scale(squashX, squashY);
  ctx.shadowColor = color;
  ctx.shadowBlur = p.power !== "none" ? 20 : 10;
  ctx.fillStyle = colors.yellow;
  roundRect(-24, -30 + step * 3 * run, 12, 27, 7);
  ctx.fill();
  roundRect(12, -30 - step * 3 * run, 12, 27, 7);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(-17, -44, 34, 44, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(-10, -37, 20, 5);
  ctx.fillStyle = colors.yellow;
  roundRect(-20, -58, 40, 20, 12);
  ctx.fill();
  ctx.fillStyle = colors.coral;
  roundRect(-11, -68, 24, 13, 8);
  ctx.fill();
  ctx.fillStyle = colors.white;
  ctx.beginPath();
  ctx.arc(7, -47, 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = colors.white;
  ctx.fillRect(-15, -34, 30, 4);
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(8, -47, 1.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = colors.coral;
  roundRect(-20, -9 + step * 4 * run, 15, 9, 4);
  ctx.fill();
  roundRect(5, -9 - step * 4 * run, 15, 9, 4);
  ctx.fill();
  if (p.power === "shield") {
    ctx.strokeStyle = colors.blue;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.72 + Math.sin(now * 0.006) * 0.18;
    ctx.beginPath();
    ctx.ellipse(0, -30, 29, 39, 0, 0, TAU);
    ctx.stroke();
  }
  if (p.power === "fire") {
    ctx.fillStyle = colors.yellow;
    ctx.shadowColor = colors.coral;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(20, -38, 5 + Math.sin(now * 0.012) * 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawParticles() {
  state.particles.forEach((p) => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, TAU);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawRings() {
  state.rings.forEach((ring) => {
    const t = ring.t / ring.life;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = Math.max(1, 4 * (1 - t));
    ctx.shadowColor = ring.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * t, 0, TAU);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawFloaters() {
  state.floaters.forEach((f) => {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 10;
    ctx.font = "900 17px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.86);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function bindEvents() {
  $("startButton").addEventListener("click", resetGame);
  $("restartButton").addEventListener("click", resetGame);
  $("levelButton").addEventListener("click", nextLevelAction);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "space", "z", "x", "c", "v", "b", "j", "control"].includes(key)) event.preventDefault();
    state.keys.add(key);
    if (key === "z" || key === " " || key === "space" || key === "w" || key === "arrowup") queueJump();
    if (key === "x" || key === "b" || key === "j" || key === "control") shootFireball();
    if (key === "enter" || key === "b") {
      if (state.mode === "start") resetGame();
      else if (state.mode === "levelClear") nextLevelAction();
      else if (state.mode === "gameover") resetGame();
    }
    if (key === "r") resetGame();
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    state.keys.delete(key);
    if ((key === "z" || key === " " || key === "space" || key === "w" || key === "arrowup") && state.player?.vy < 0) {
      state.player.vy *= 0.72;
    }
  });

  document.querySelectorAll(".touch-controls button").forEach((button) => {
    const hold = button.dataset.hold;
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (hold) state.touch[hold] = true;
      if (action === "jump") queueJump();
      if (action === "fire") shootFireball();
    });
    button.addEventListener("pointerup", () => {
      if (hold) state.touch[hold] = false;
    });
    button.addEventListener("pointerleave", () => {
      if (hold) state.touch[hold] = false;
    });
    button.addEventListener("pointercancel", () => {
      if (hold) state.touch[hold] = false;
    });
  });

  document.addEventListener("visibilitychange", () => {
    state.lastTime = performance.now();
    state.frameAccumulator = 0;
  });
}

function queueJump() {
  if (state.mode === "start") {
    resetGame();
    return;
  }
  state.jumpQueued = true;
}

function loop(now) {
  const dt = Math.min(0.05, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  state.frameAccumulator = Math.min(0.08, state.frameAccumulator + dt);
  const step = 1 / 120;
  let guard = 0;
  while (state.frameAccumulator >= step && guard < 8) {
    update(step);
    state.frameAccumulator -= step;
    guard += 1;
  }
  draw(now);
  requestAnimationFrame(loop);
}

state.world = createLevel(0);
state.player = createPlayer(state.world.start.x, state.world.start.y);
bindEvents();
updateUi();
requestAnimationFrame((now) => {
  state.lastTime = now;
  loop(now);
});
