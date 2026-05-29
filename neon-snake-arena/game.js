const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

const W = canvas.width;
const H = canvas.height;
const CELL = 30;
const COLS = Math.floor(W / CELL);
const ROWS = Math.floor(H / CELL);
const TAU = Math.PI * 2;
const MAX_PARTICLES = 260;
const MAX_FLOATERS = 22;
const MAX_SHOCKWAVES = 12;

const $ = (id) => document.getElementById(id);
const ui = {
  score: $("score"),
  crystals: $("crystals"),
  sector: $("sector"),
  length: $("length"),
  combo: $("combo"),
  shield: $("shield"),
  missionTitle: $("missionTitle"),
  missionText: $("missionText"),
  missionMeter: $("missionMeter"),
  statusLabel: $("statusLabel"),
  statusText: $("statusText"),
  threatLabel: $("threatLabel"),
  threatText: $("threatText"),
  upgradeHint: $("upgradeHint"),
  engineLevel: $("engineLevel"),
  magnetLevel: $("magnetLevel"),
  shieldLevel: $("shieldLevel"),
  phaseLevel: $("phaseLevel"),
  boostCooldown: $("boostCooldown"),
  focusCooldown: $("focusCooldown"),
  pulseCooldown: $("pulseCooldown"),
  phaseCooldown: $("phaseCooldown"),
  startOverlay: $("startOverlay"),
  sectorOverlay: $("sectorOverlay"),
  gameOverOverlay: $("gameOverOverlay"),
  sectorTitle: $("sectorTitle"),
  sectorText: $("sectorText"),
  resultTitle: $("resultTitle"),
  resultText: $("resultText"),
};

const dirs = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const upgradeMeta = {
  engine: { label: "引擎", cost: [0, 12, 22, 34, 48] },
  magnet: { label: "磁吸", cost: [8, 16, 28, 42] },
  shield: { label: "護盾", cost: [10, 20, 35, 52] },
  phase: { label: "相位", cost: [18, 32, 50] },
};

const colors = {
  cyan: "#2fffd1",
  pink: "#ff3df2",
  yellow: "#ffe55c",
  orange: "#ff8a2a",
  red: "#ff365f",
  blue: "#52a7ff",
  green: "#7dff77",
};

const state = {
  mode: "start",
  score: 0,
  crystals: 0,
  sector: 1,
  collected: 0,
  target: 8,
  combo: 0,
  comboTimer: 0,
  multiplier: 1,
  snake: [],
  prevSnake: [],
  dir: dirs.right,
  nextDir: dirs.right,
  queue: [],
  grow: 0,
  tickMs: 132,
  tickAccumulator: 0,
  tickProgress: 0,
  lastTime: 0,
  food: null,
  powerups: [],
  hazards: [],
  gates: [],
  portals: [],
  particles: [],
  floaters: [],
  stars: [],
  shockwaves: [],
  screenShake: 0,
  flash: 0,
  slowMo: 0,
  starTime: 0,
  phaseTime: 0,
  boostTime: 0,
  pulseTime: 0,
  paused: false,
  upgrades: { engine: 1, magnet: 0, shield: 0, phase: 0 },
  shield: 0,
  cooldowns: { boost: 0, focus: 0, pulse: 0, phase: 0 },
  boss: null,
  deaths: 0,
  bonusMission: { type: "combo", progress: 0, target: 6, complete: false },
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

function cellKey(p) {
  return `${p.x},${p.y}`;
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function centerOf(cell) {
  return { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
}

function addParticle(x, y, color, count = 12, speed = 150, size = 3) {
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
      maxLife: rand(0.5, 1.0),
      color,
      size: rand(size * 0.45, size * 1.5),
    });
  }
}

function addShockwave(x, y, color, radius = 110) {
  if (state.shockwaves.length >= MAX_SHOCKWAVES) state.shockwaves.shift();
  state.shockwaves.push({ x, y, color, radius, t: 0, life: 0.55 });
}

function addFloater(text, x, y, color = "#ffffff") {
  if (state.floaters.length >= MAX_FLOATERS) state.floaters.shift();
  state.floaters.push({ text, x, y, vy: -34, life: 1.0, color });
}

function createStars() {
  state.stars = Array.from({ length: 130 }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    z: rand(0.25, 1),
    pulse: rand(0, TAU),
  }));
}

function resetGame() {
  startAudio();
  playSfx("start");
  state.mode = "playing";
  state.score = 0;
  state.crystals = 0;
  state.sector = 1;
  state.collected = 0;
  state.target = 8;
  state.combo = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.dir = dirs.right;
  state.nextDir = dirs.right;
  state.queue = [];
  state.grow = 0;
  state.tickAccumulator = 0;
  state.tickProgress = 0;
  state.lastTime = performance.now();
  state.powerups = [];
  state.hazards = [];
  state.gates = [];
  state.portals = [];
  state.particles = [];
  state.floaters = [];
  state.shockwaves = [];
  state.screenShake = 0;
  state.flash = 0;
  state.slowMo = 0;
  state.starTime = 0;
  state.phaseTime = 0;
  state.boostTime = 0;
  state.pulseTime = 0;
  state.paused = false;
  state.upgrades = { engine: 1, magnet: 0, shield: 0, phase: 0 };
  state.shield = 0;
  state.cooldowns = { boost: 0, focus: 0, pulse: 0, phase: 0 };
  state.boss = null;
  state.deaths = 0;
  state.bonusMission = { type: "combo", progress: 0, target: 6, complete: false };
  state.snake = [];
  const startX = Math.floor(COLS / 2) - 3;
  const startY = Math.floor(ROWS / 2);
  for (let i = 0; i < 6; i += 1) {
    state.snake.push({ x: startX - i, y: startY });
  }
  state.prevSnake = state.snake.map((p) => ({ ...p }));
  createSector();
  hideOverlays();
  updateUi();
}

function setupPreview() {
  const startX = Math.floor(COLS / 2) - 3;
  const startY = Math.floor(ROWS / 2);
  state.snake = [];
  for (let i = 0; i < 6; i += 1) {
    state.snake.push({ x: startX - i, y: startY });
  }
  state.prevSnake = state.snake.map((p) => ({ ...p }));
  state.food = { x: startX + 9, y: startY + 2, type: "core", value: 100, pulse: 0 };
  state.hazards = [
    { x: startX + 5, y: startY - 4, type: "mine", phase: 0.4, arm: 0 },
    { x: startX + 7, y: startY - 4, type: "mine", phase: 1.1, arm: 0 },
    { x: startX + 9, y: startY - 4, type: "mine", phase: 2.0, arm: 0 },
  ];
}

function hideOverlays() {
  ui.startOverlay.classList.remove("active");
  ui.sectorOverlay.classList.remove("active");
  ui.gameOverOverlay.classList.remove("active");
}

function isOccupied(cell, includeHazards = true) {
  if (state.snake.some((p) => sameCell(p, cell))) return true;
  if (state.food && sameCell(state.food, cell)) return true;
  if (state.powerups.some((p) => sameCell(p, cell))) return true;
  if (includeHazards && state.hazards.some((p) => sameCell(p, cell))) return true;
  if (includeHazards && state.gates.some((g) => gateCells(g).some((p) => sameCell(p, cell)))) return true;
  if (state.portals.some((p) => sameCell(p, cell))) return true;
  return false;
}

function randomEmptyCell(margin = 2) {
  for (let i = 0; i < 500; i += 1) {
    const cell = {
      x: Math.floor(rand(margin, COLS - margin)),
      y: Math.floor(rand(margin, ROWS - margin)),
    };
    if (!isOccupied(cell)) return cell;
  }
  return { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

function spawnFood() {
  const cell = randomEmptyCell(2);
  state.food = {
    ...cell,
    type: "core",
    value: 100 + state.sector * 15,
    pulse: rand(0, TAU),
  };
}

function spawnPowerup(forceType = null) {
  const roll = Math.random();
  const type = forceType || (roll > 0.97 ? "star" : roll > 0.91 ? "relic" : roll > 0.78 ? "laser" : ["crystal", "shield", "focus", "pulse", "phase"][Math.floor(rand(0, 5))]);
  state.powerups.push({
    ...randomEmptyCell(2),
    type,
    life: ["crystal", "relic", "star"].includes(type) ? 12 : 9,
    pulse: rand(0, TAU),
  });
}

function createSector() {
  state.collected = 0;
  state.target = 7 + Math.min(11, state.sector);
  setupBonusMission();
  state.tickMs = Math.max(74, 138 - state.sector * 5 - state.upgrades.engine * 3);
  state.hazards = [];
  state.gates = [];
  state.portals = [];
  state.boss = null;

  const mineCount = Math.min(5 + state.sector * 2, 28);
  for (let i = 0; i < mineCount; i += 1) {
    const cell = randomEmptyCell(3);
    state.hazards.push({
      ...cell,
      type: chance(0.35) ? "pulse" : "mine",
      phase: rand(0, TAU),
      arm: rand(0.2, 1.4),
    });
  }

  if (state.sector >= 2) {
    const gateCount = Math.min(1 + Math.floor(state.sector / 2), 5);
    for (let i = 0; i < gateCount; i += 1) {
      state.gates.push({
        axis: chance(0.5) ? "h" : "v",
        lane: chance(0.5) ? Math.floor(rand(4, ROWS - 4)) : Math.floor(rand(5, COLS - 5)),
        offset: Math.floor(rand(3, 12)),
        length: Math.floor(rand(5, 10)),
        speed: rand(0.45, 0.9) * (chance(0.5) ? 1 : -1),
        phase: rand(0, TAU),
      });
    }
  }

  if (state.sector >= 3) {
    const a = randomEmptyCell(3);
    const b = randomEmptyCell(3);
    state.portals.push({ ...a, id: 1, pair: 2, pulse: 0 });
    state.portals.push({ ...b, id: 2, pair: 1, pulse: Math.PI });
    const chaserCount = Math.min(1 + Math.floor(state.sector / 4), 4);
    for (let i = 0; i < chaserCount; i += 1) {
      state.hazards.push({ ...randomEmptyCell(4), type: "chaser", phase: rand(0, TAU), arm: 0.8, moveTimer: rand(0.6, 1.4) });
    }
  }

  if (state.sector % 4 === 0) {
    state.boss = {
      x: Math.floor(COLS * 0.5),
      y: Math.floor(ROWS * 0.32),
      hp: 5 + state.sector,
      maxHp: 5 + state.sector,
      t: 0,
      nextShot: 1.2,
    };
    state.target += 4;
  }

  spawnFood();
  if (state.sector > 1) spawnPowerup("crystal");
  for (let i = 0; i < Math.min(3, Math.floor(state.sector / 2)); i += 1) spawnPowerup();
  triggerSectorTwist();
  state.flash = 0.35;
  updateThreatText();
}

function triggerSectorTwist() {
  const head = centerOf(state.snake[0]);
  if (state.sector === 1) {
    addFloater("資料核心甦醒", head.x, head.y - 45, colors.cyan);
    return;
  }
  if (state.sector % 5 === 0) {
    spawnPowerup("star");
    addFloater("STAR CORE LEAK", W / 2, 82, colors.yellow);
    addShockwave(W / 2, H / 2, colors.yellow, 360);
    state.flash = 0.55;
  } else if (state.sector % 3 === 0) {
    state.hazards.push({ ...randomEmptyCell(4), type: "chaser", phase: rand(0, TAU), arm: 0.45, moveTimer: 0.5 });
    spawnPowerup("phase");
    addFloater("追跡程式入侵", W / 2, 82, colors.pink);
    addShockwave(W / 2, H / 2, colors.pink, 300);
    state.screenShake = 5;
  } else if (state.sector % 4 === 0) {
    spawnPowerup("laser");
    addFloater("守門者上線", W / 2, 82, colors.orange);
    addShockwave(W / 2, H / 2, colors.orange, 330);
  } else {
    addFloater("路徑重組", head.x, head.y - 45, colors.blue);
  }
}

function gateCells(gate) {
  const cells = [];
  const swing = Math.round(Math.sin(gate.phase) * 5);
  const start = gate.offset + swing;
  for (let i = 0; i < gate.length; i += 1) {
    if (gate.axis === "h") {
      const x = clamp(start + i, 1, COLS - 2);
      const y = clamp(gate.lane, 1, ROWS - 2);
      cells.push({ x, y });
    } else {
      const x = clamp(gate.lane, 1, COLS - 2);
      const y = clamp(start + i, 1, ROWS - 2);
      cells.push({ x, y });
    }
  }
  return cells;
}

function updateThreatText() {
  const level = state.sector < 3 ? "低" : state.sector < 6 ? "中" : state.sector < 9 ? "高" : "極高";
  ui.threatLabel.textContent = level;
  const bits = [];
  if (state.hazards.length) bits.push(`${state.hazards.length} 個脈衝點`);
  if (state.gates.length) bits.push(`${state.gates.length} 道閃電門`);
  if (state.portals.length) bits.push("傳送裂縫");
  if (state.boss) bits.push("守門者");
  ui.threatText.textContent = bits.join("、") || "目前穩定。";
}

function queueDirection(dirName) {
  const desired = dirs[dirName];
  if (!desired || state.mode !== "playing") return;
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.nextDir;
  if (desired.x + last.x === 0 && desired.y + last.y === 0) return;
  if (state.queue.length === 0) state.queue.push(desired);
}

function canUseAbility(name) {
  if (state.mode !== "playing" || state.paused) return false;
  if (state.cooldowns[name] > 0) return false;
  if (name === "phase" && state.upgrades.phase <= 0) return false;
  return true;
}

function useAbility(name) {
  if (!canUseAbility(name)) return;
  playSfx(name);
  if (name === "boost") {
    state.boostTime = 1.35;
    state.cooldowns.boost = Math.max(4.4, 6.2 - state.upgrades.engine * 0.35);
    addFloater("BOOST", centerOf(state.snake[0]).x, centerOf(state.snake[0]).y, colors.yellow);
  }
  if (name === "focus") {
    state.slowMo = 3.3;
    state.cooldowns.focus = 13;
    state.flash = 0.2;
    addShockwave(centerOf(state.snake[0]).x, centerOf(state.snake[0]).y, colors.blue, 180);
  }
  if (name === "pulse") {
    const head = centerOf(state.snake[0]);
    state.pulseTime = 0.28;
    state.cooldowns.pulse = 10.5;
    addShockwave(head.x, head.y, colors.pink, 230);
    clearNearbyHazards(5);
  }
  if (name === "phase") {
    state.phaseTime = 3 + state.upgrades.phase * 0.9;
    state.cooldowns.phase = 16;
    addShockwave(centerOf(state.snake[0]).x, centerOf(state.snake[0]).y, colors.cyan, 160);
  }
  updateUi();
}

function clearNearbyHazards(radius) {
  const head = state.snake[0];
  let cleared = 0;
  state.hazards = state.hazards.filter((hazard) => {
    const d = Math.abs(hazard.x - head.x) + Math.abs(hazard.y - head.y);
    if (d <= radius) {
      const c = centerOf(hazard);
      addParticle(c.x, c.y, colors.pink, 16, 190, 4);
      cleared += 1;
      return false;
    }
    return true;
  });
  if (cleared > 0) {
    state.score += cleared * 35;
    addFloater(`+${cleared * 35}`, centerOf(head).x, centerOf(head).y, colors.pink);
  }
}

function update(dt) {
  if (state.mode !== "playing" || state.paused) {
    updateEffects(dt);
    return;
  }

  const timeScale = state.slowMo > 0 ? 0.52 : 1;
  const boosted = state.boostTime > 0 ? 0.55 : 1;
  state.tickAccumulator += dt * 1000 * timeScale / boosted;
  const tickMs = Math.max(54, state.tickMs - Math.min(22, state.combo * 0.9));

  while (state.tickAccumulator >= tickMs) {
    state.tickAccumulator -= tickMs;
    step();
  }

  state.tickProgress = clamp(state.tickAccumulator / tickMs, 0, 1);
  updateTimers(dt);
  updateMovingObjects(dt);
  updateMagnet(dt);
  updateEffects(dt);
}

function updateTimers(dt) {
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.slowMo = Math.max(0, state.slowMo - dt);
  state.starTime = Math.max(0, state.starTime - dt);
  state.phaseTime = Math.max(0, state.phaseTime - dt);
  state.boostTime = Math.max(0, state.boostTime - dt);
  state.pulseTime = Math.max(0, state.pulseTime - dt);
  Object.keys(state.cooldowns).forEach((key) => {
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
  });
  state.powerups.forEach((p) => {
    p.life -= dt;
    p.pulse += dt * 5;
  });
  state.powerups = state.powerups.filter((p) => p.life > 0);
  if (chance(dt * (0.08 + state.sector * 0.018)) && state.powerups.length < 6) spawnPowerup();
  if (state.food) state.food.pulse += dt * 5;
}

function updateMovingObjects(dt) {
  state.hazards.forEach((hazard) => {
    hazard.phase += dt * (hazard.type === "pulse" ? 3.8 : 1.7);
    hazard.arm = Math.max(0, hazard.arm - dt);
    if (hazard.type === "chaser" && state.mode === "playing") {
      hazard.moveTimer = Math.max(0, (hazard.moveTimer || 0) - dt);
      if (hazard.moveTimer <= 0) {
        hazard.moveTimer = Math.max(0.32, 0.95 - state.sector * 0.035);
        const head = state.snake[0];
        const next = {
          x: clamp(hazard.x + Math.sign(head.x - hazard.x), 1, COLS - 2),
          y: clamp(hazard.y + Math.sign(head.y - hazard.y), 1, ROWS - 2),
        };
        if (!state.hazards.some((other) => other !== hazard && sameCell(other, next)) && !sameCell(next, head)) {
          hazard.x = next.x;
          hazard.y = next.y;
        }
      }
    }
  });
  state.gates.forEach((gate) => {
    gate.phase += dt * gate.speed;
  });
  state.portals.forEach((portal) => {
    portal.pulse += dt * 4;
  });
  if (state.boss) {
    state.boss.t += dt;
    state.boss.nextShot -= dt;
    if (state.boss.nextShot <= 0) {
      state.boss.nextShot = Math.max(0.65, 1.8 - state.sector * 0.08);
      const cell = {
        x: clamp(Math.round(state.boss.x + Math.cos(state.boss.t * 1.7) * 8), 2, COLS - 3),
        y: clamp(Math.round(state.boss.y + Math.sin(state.boss.t * 2.1) * 5), 2, ROWS - 3),
      };
      if (!isOccupied(cell, false)) {
        state.hazards.push({ ...cell, type: "pulse", phase: 0, arm: 0.45 });
      }
    }
  }
}

function updateMagnet(dt) {
  const radius = 1.6 + state.upgrades.magnet * 1.8;
  if (state.upgrades.magnet <= 0) return;
  const head = state.snake[0];
  const pull = (item) => {
    const dx = head.x - item.x;
    const dy = head.y - item.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist <= radius && chance(dt * state.upgrades.magnet * 3.2)) {
      item.x += Math.sign(dx);
      item.y += Math.sign(dy);
      item.x = clamp(item.x, 1, COLS - 2);
      item.y = clamp(item.y, 1, ROWS - 2);
    }
  };
  if (state.food) pull(state.food);
  state.powerups.forEach(pull);
}

function updateEffects(dt) {
  if (state.starTime > 0 && state.snake.length && chance(dt * 16)) {
    const head = centerOf(state.snake[0]);
    addParticle(head.x + rand(-12, 12), head.y + rand(-12, 12), colors.yellow, 2, 80, 2);
  }
  state.particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.985;
    p.vy *= 0.985;
  });
  state.particles = state.particles.filter((p) => p.life > 0);
  state.floaters.forEach((f) => {
    f.life -= dt;
    f.y += f.vy * dt;
  });
  state.floaters = state.floaters.filter((f) => f.life > 0);
  state.shockwaves.forEach((s) => {
    s.t += dt;
  });
  state.shockwaves = state.shockwaves.filter((s) => s.t < s.life);
  state.screenShake = Math.max(0, state.screenShake - dt * 18);
  state.flash = Math.max(0, state.flash - dt * 1.6);
}

function step() {
  state.prevSnake = state.snake.map((p) => ({ ...p }));
  if (state.queue.length) {
    state.nextDir = state.queue.shift();
  }
  state.dir = state.nextDir;

  const head = state.snake[0];
  let next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  next = handlePortalAndBounds(next);

  if (checkCollision(next)) return;

  state.snake.unshift(next);
  let ate = false;
  if (state.food && sameCell(next, state.food)) {
    consumeFood(next);
    ate = true;
  }

  const powerupIndex = state.powerups.findIndex((p) => sameCell(p, next));
  if (powerupIndex >= 0) {
    consumePowerup(state.powerups.splice(powerupIndex, 1)[0], next);
    ate = true;
  }

  if (state.grow > 0) {
    state.grow -= 1;
  } else if (!ate) {
    state.snake.pop();
  }

  if (state.boss && sameCell(next, { x: Math.round(state.boss.x), y: Math.round(state.boss.y) })) {
    damageBoss(next);
  }

  if (state.collected >= state.target) {
    clearSector();
  }
}

function handlePortalAndBounds(next) {
  const portal = state.portals.find((p) => sameCell(p, next));
  if (portal) {
    const paired = state.portals.find((p) => p.id === portal.pair);
    if (paired) {
      const out = { x: paired.x + state.dir.x, y: paired.y + state.dir.y };
      addShockwave(centerOf(portal).x, centerOf(portal).y, colors.blue, 100);
      addShockwave(centerOf(paired).x, centerOf(paired).y, colors.cyan, 100);
      playSfx("portal");
      return {
        x: clamp(out.x, 0, COLS - 1),
        y: clamp(out.y, 0, ROWS - 1),
      };
    }
  }
  return next;
}

function checkCollision(next) {
  const phased = state.phaseTime > 0;
  const outOfBounds = next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS;
  const bodyHit = state.snake.slice(0, -1).some((p) => sameCell(p, next));
  const hazardHit = state.hazards.some((p) => sameCell(p, next) && p.arm <= 0);
  const gateHit = state.gates.some((g) => gateCells(g).some((p) => sameCell(p, next)));

  if (phased && (outOfBounds || bodyHit)) {
    if (outOfBounds) {
      next.x = (next.x + COLS) % COLS;
      next.y = (next.y + ROWS) % ROWS;
    }
    return false;
  }

  if (outOfBounds || bodyHit || hazardHit || gateHit) {
    if (state.starTime > 0 && !outOfBounds && !bodyHit) {
      state.hazards = state.hazards.filter((h) => !sameCell(h, next));
      state.score += 80;
      addParticle(centerOf(next).x, centerOf(next).y, colors.yellow, 18, 260, 4);
      playSfx("powerup");
      return false;
    }
    if (state.shield > 0) {
      state.shield -= 1;
      state.screenShake = 8;
      state.phaseTime = 1.2;
      addShockwave(centerOf(state.snake[0]).x, centerOf(state.snake[0]).y, colors.yellow, 160);
      addFloater("SHIELD", centerOf(state.snake[0]).x, centerOf(state.snake[0]).y, colors.yellow);
      playSfx("shield");
      if (hazardHit) state.hazards = state.hazards.filter((h) => !sameCell(h, next));
      updateUi();
      return false;
    }
    endGame(outOfBounds ? "撞上邊界" : bodyHit ? "咬到自身" : gateHit ? "撞上閃電門" : "踩中脈衝雷");
    return true;
  }
  return false;
}

function consumeFood(cell) {
  const c = centerOf(cell);
  const comboBoost = 1 + Math.floor(state.combo / 5) * 0.25;
  const points = Math.round(state.food.value * comboBoost);
  state.score += points;
  state.crystals += 1 + (state.combo > 0 && state.combo % 4 === 0 ? 1 : 0);
  state.combo += 1;
  state.comboTimer = 4.8;
  state.collected += 1;
  advanceBonusMission("combo", state.combo);
  state.grow += 1 + Math.floor(state.combo / 7);
  addParticle(c.x, c.y, colors.cyan, 24, 260, 4);
  addFloater(`+${points}`, c.x, c.y, colors.cyan);
  playSfx(state.combo % 6 === 0 ? "combo" : "eat");
  state.screenShake = Math.min(8, 2 + state.combo * 0.12);
  if (state.combo % 6 === 0) spawnPowerup("crystal");
  spawnFood();
  updateUi();
}

function consumePowerup(powerup, cell) {
  const c = centerOf(cell);
  const map = {
    crystal: () => {
      state.crystals += 5;
      state.score += 60;
      addFloater("+5 結晶", c.x, c.y, colors.yellow);
    },
    shield: () => {
      state.shield = Math.min(3 + state.upgrades.shield, state.shield + 1);
      addFloater("護盾 +1", c.x, c.y, colors.yellow);
    },
    focus: () => {
      state.slowMo = 2.5;
      addFloater("FOCUS", c.x, c.y, colors.blue);
    },
    pulse: () => {
      clearNearbyHazards(4);
      addFloater("PULSE", c.x, c.y, colors.pink);
    },
    phase: () => {
      state.phaseTime = 2.4 + state.upgrades.phase * 0.6;
      addFloater("PHASE", c.x, c.y, colors.cyan);
    },
    laser: () => {
      const head = state.snake[0];
      const before = state.hazards.length;
      state.hazards = state.hazards.filter((hazard) => hazard.x !== head.x && hazard.y !== head.y);
      const cleared = before - state.hazards.length;
      state.score += cleared * 65;
      addShockwave(c.x, c.y, colors.red, 230);
      addFloater(`LASER +${cleared}`, c.x, c.y, colors.red);
    },
    relic: () => {
      state.crystals += 9;
      state.score += 450;
      addFloater("HIDDEN RELIC", c.x, c.y, colors.yellow);
    },
    star: () => {
      state.starTime = 6.5;
      state.score += 250;
      addFloater("STAR CORE", c.x, c.y, colors.yellow);
    },
  };
  map[powerup.type]?.();
  advanceBonusMission("powerup", 1);
  addParticle(c.x, c.y, powerupColor(powerup.type), 20, 220, 4);
  addShockwave(c.x, c.y, powerupColor(powerup.type), 130);
  playSfx("powerup");
  updateUi();
}

function damageBoss(cell) {
  const boss = state.boss;
  const c = centerOf(cell);
  boss.hp -= 1;
  state.score += 150;
  state.grow += 1;
  playSfx(boss.hp <= 0 ? "bossDown" : "bossHit");
  addParticle(c.x, c.y, colors.orange, 28, 310, 5);
  addShockwave(c.x, c.y, colors.orange, 170);
  addFloater("守門者受損", c.x, c.y, colors.orange);
  if (boss.hp <= 0) {
    state.boss = null;
    state.crystals += 10;
    state.collected += 3;
    addFloater("+10 結晶", c.x, c.y - 25, colors.yellow);
  } else {
    const relocated = randomEmptyCell(4);
    boss.x = relocated.x;
    boss.y = relocated.y;
  }
  updateUi();
}

function clearSector() {
  state.mode = "sector";
  state.crystals += 4 + Math.floor(state.sector / 2);
  state.score += 500 + state.sector * 80;
  ui.sectorTitle.textContent = `區段 ${state.sector} 突破`;
  ui.sectorText.textContent = `取得 ${state.collected}/${state.target} 個核心。使用結晶升級後，進入更快、更密集的下一區段。`;
  ui.sectorOverlay.classList.add("active");
  state.flash = 0.45;
  addShockwave(W / 2, H / 2, colors.cyan, 420);
  playSfx("sector");
  updateUi();
}

function setupBonusMission() {
  const type = state.sector % 2 === 0 ? "powerup" : "combo";
  state.bonusMission = {
    type,
    progress: 0,
    target: type === "powerup" ? 2 + Math.min(2, Math.floor(state.sector / 4)) : 6 + Math.min(4, Math.floor(state.sector / 3)),
    complete: false,
  };
}

function advanceBonusMission(type, amount = 1) {
  const mission = state.bonusMission;
  if (mission.complete || mission.type !== type) return;
  mission.progress = type === "combo" ? Math.max(mission.progress, amount) : mission.progress + amount;
  if (mission.progress >= mission.target) {
    mission.progress = mission.target;
    mission.complete = true;
    state.score += 450 + state.sector * 60;
    if (type === "combo") {
      state.crystals += 8 + Math.floor(state.sector / 2);
      state.shield = Math.min(3 + state.upgrades.shield, state.shield + 1);
    } else {
      state.crystals += 6 + state.sector;
      state.phaseTime = Math.max(state.phaseTime, 3.5);
    }
    addFloater("小任務完成", W / 2, 98, colors.yellow);
    addShockwave(W / 2, H / 2, colors.yellow, 280);
    playSfx("combo");
  }
}

function bonusMissionText() {
  const mission = state.bonusMission;
  const label = mission.type === "combo" ? "連擊試煉" : "能力回收";
  const reward = mission.type === "combo" ? "結晶與護盾" : "結晶與相位";
  return `${label} ${mission.progress}/${mission.target}${mission.complete ? " 完成" : ""}，獎勵 ${reward}`;
}

function nextSector() {
  if (state.mode !== "sector") return;
  state.mode = "playing";
  state.sector += 1;
  state.dir = dirs.right;
  state.nextDir = dirs.right;
  state.queue = [];
  ui.sectorOverlay.classList.remove("active");
  createSector();
  playSfx("next");
  updateUi();
}

function endGame(reason) {
  state.mode = "gameover";
  state.deaths += 1;
  state.screenShake = 13;
  state.flash = 0.55;
  const head = centerOf(state.snake[0]);
  addParticle(head.x, head.y, colors.red, 80, 360, 6);
  addShockwave(head.x, head.y, colors.red, 260);
  playSfx("gameover");
  ui.resultTitle.textContent = reason;
  ui.resultText.textContent = `分數 ${state.score.toLocaleString()} ｜ 區段 ${state.sector} ｜ 長度 ${state.snake.length}`;
  ui.gameOverOverlay.classList.add("active");
  updateUi();
}

function buyUpgrade(name) {
  if (state.mode !== "sector") return;
  const current = state.upgrades[name];
  const meta = upgradeMeta[name];
  const cost = meta.cost[current] ?? Infinity;
  if (state.crystals < cost) {
    playSfx("deny");
    ui.upgradeHint.textContent = `${meta.label} 需要 ${cost} 結晶`;
    return;
  }
  state.crystals -= cost;
  state.upgrades[name] += 1;
  if (name === "shield") state.shield += 1;
  if (name === "engine") state.tickMs = Math.max(70, state.tickMs - 4);
  ui.upgradeHint.textContent = `${meta.label} 已升級`;
  addFloater("UPGRADE", W - 130, 92, colors.yellow);
  playSfx("upgrade");
  updateUi();
}

function startAudio() {
  if (state.audio.enabled && state.audio.ctx?.state === "running") return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  if (!state.audio.ctx) {
    const audioCtx = new AudioCtor();
    const compressor = audioCtx.createDynamicsCompressor();
    const master = audioCtx.createGain();
    const music = audioCtx.createGain();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.gain.value = 0.3;
    music.gain.value = 0.12;
    music.connect(compressor);
    compressor.connect(master);
    master.connect(audioCtx.destination);
    state.audio.ctx = audioCtx;
    state.audio.master = compressor;
    state.audio.music = music;
  }
  state.audio.ctx.resume?.();
  state.audio.enabled = true;
  if (!state.audio.timer) state.audio.timer = window.setInterval(scheduleMusic, 180);
}

function scheduleMusic() {
  const audio = state.audio;
  if (!audio.ctx || audio.ctx.state !== "running" || !["playing", "sector"].includes(state.mode)) return;
  const step = audio.step % 32;
  const now = audio.ctx.currentTime + 0.035;
  const bass = [110, 110, 147, 147, 131, 131, 165, 165];
  const lead = [440, 0, 554, 0, 659, 554, 494, 0, 392, 0, 494, 0, 587, 494, 440, 0];
  if (step % 4 === 0) playTone(bass[(step / 4) % bass.length], 0.18, "triangle", 0.052, now, audio.music);
  if (lead[step % lead.length]) playTone(lead[step % lead.length], 0.09, "square", 0.035, now, audio.music);
  if (step % 8 === 6) playNoise(0.035, 0.018, now, audio.music);
  audio.step += 1;
}

function playTone(freq, duration = 0.08, type = "sine", gainValue = 0.06, when = 0, destination = null) {
  const audio = state.audio;
  if (!audio.ctx || !audio.enabled) return;
  const audioCtx = audio.ctx;
  const start = when || audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(24, freq), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(destination || audio.master);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function playNoise(duration = 0.08, gainValue = 0.04, when = 0, destination = null) {
  const audio = state.audio;
  if (!audio.ctx || !audio.enabled) return;
  const audioCtx = audio.ctx;
  const start = when || audioCtx.currentTime;
  const buffer = audioCtx.createBuffer(1, Math.max(1, Math.floor(audioCtx.sampleRate * duration)), audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = rand(-1, 1) * (1 - i / data.length);
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1200, start);
  filter.Q.setValueAtTime(3, start);
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination || audio.master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playSfx(name) {
  if (!state.audio.enabled || !state.audio.ctx) return;
  const now = state.audio.ctx.currentTime;
  if (name === "start") [330, 494, 660, 990].forEach((freq, i) => playTone(freq, 0.08, "square", 0.055, now + i * 0.045));
  if (name === "eat") playTone(760 + state.combo * 12, 0.055, "triangle", 0.055, now);
  if (name === "combo") [740, 990, 1320].forEach((freq, i) => playTone(freq, 0.07, "square", 0.055, now + i * 0.04));
  if (name === "powerup") [520, 780].forEach((freq, i) => playTone(freq, 0.09, "sine", 0.06, now + i * 0.055));
  if (name === "boost") playTone(220, 0.15, "sawtooth", 0.065, now);
  if (name === "focus") playTone(392, 0.18, "triangle", 0.055, now);
  if (name === "pulse") {
    playTone(140, 0.18, "square", 0.07, now);
    playNoise(0.16, 0.055, now + 0.02);
  }
  if (name === "phase" || name === "portal") [660, 880].forEach((freq, i) => playTone(freq, 0.08, "sine", 0.045, now + i * 0.04));
  if (name === "shield") playTone(300, 0.16, "triangle", 0.07, now);
  if (name === "bossHit") playTone(130, 0.12, "sawtooth", 0.07, now);
  if (name === "bossDown") {
    playTone(92, 0.34, "sawtooth", 0.08, now);
    playNoise(0.28, 0.08, now + 0.03);
  }
  if (name === "sector" || name === "next") [392, 523, 784, 1046].forEach((freq, i) => playTone(freq, 0.1, "square", 0.058, now + i * 0.06));
  if (name === "upgrade") [330, 495, 660].forEach((freq, i) => playTone(freq, 0.08, "triangle", 0.055, now + i * 0.045));
  if (name === "deny") playTone(120, 0.12, "sawtooth", 0.045, now);
  if (name === "gameover") {
    [220, 165, 110].forEach((freq, i) => playTone(freq, 0.16, "sawtooth", 0.065, now + i * 0.09));
    playNoise(0.22, 0.055, now + 0.03);
  }
}

function formatCooldown(value, locked = false) {
  if (locked) return "Locked";
  return value <= 0 ? "Ready" : `${value.toFixed(1)}s`;
}

function updateUi() {
  ui.score.textContent = state.score.toLocaleString();
  ui.crystals.textContent = state.crystals.toString();
  ui.sector.textContent = state.sector.toString();
  ui.length.textContent = state.snake.length.toString();
  ui.combo.textContent = state.combo.toString();
  ui.shield.textContent = state.shield.toString();
  ui.missionTitle.textContent = state.boss ? "擊破守門者並收集核心" : "收集資料核心";
  ui.missionText.textContent = `核心 ${state.collected}/${state.target}，${bonusMissionText()}。`;
  ui.missionMeter.style.width = `${clamp((state.collected / state.target) * 100, 0, 100)}%`;
  ui.statusLabel.textContent = state.starTime > 0 ? "STAR" : state.phaseTime > 0 ? "相位中" : state.slowMo > 0 ? "專注中" : state.boostTime > 0 ? "加速中" : "穩定";
  ui.statusText.textContent = state.phaseTime > 0
    ? "可穿牆與穿越自身。"
    : state.slowMo > 0
      ? "時間放慢，適合穿越高密度陷阱。"
      : "方向鍵 / WASD 移動；Z 加速、X 專注、C 脈衝、V 相位；升級畫面 Z/X/C/V 選升級，B 進下一區段。";
  ui.engineLevel.textContent = `Lv.${state.upgrades.engine}`;
  ui.magnetLevel.textContent = `Lv.${state.upgrades.magnet}`;
  ui.shieldLevel.textContent = `Lv.${state.upgrades.shield}`;
  ui.phaseLevel.textContent = `Lv.${state.upgrades.phase}`;
  ui.boostCooldown.textContent = formatCooldown(state.cooldowns.boost);
  ui.focusCooldown.textContent = formatCooldown(state.cooldowns.focus);
  ui.pulseCooldown.textContent = formatCooldown(state.cooldowns.pulse);
  ui.phaseCooldown.textContent = formatCooldown(state.cooldowns.phase, state.upgrades.phase <= 0);

  document.querySelectorAll(".upgrade-button").forEach((button) => {
    const name = button.dataset.upgrade;
    const current = state.upgrades[name];
    const cost = upgradeMeta[name].cost[current];
    const small = button.querySelector("small");
    const maxed = cost === undefined;
    button.disabled = state.mode !== "sector" || maxed || state.crystals < cost;
    if (small) {
      const base = {
        engine: "轉向緩衝與速度穩定",
        magnet: "拉近核心與結晶",
        shield: "抵消一次碰撞",
        phase: "短暫穿越自身與牆面",
      }[name];
      small.textContent = maxed ? `${base} ｜ 已滿級` : `${base} ｜ ${cost} 結晶`;
    }
  });

  $("phaseButton").disabled = state.upgrades.phase <= 0;
}

function powerupColor(type) {
  return {
    crystal: colors.yellow,
    shield: colors.orange,
    focus: colors.blue,
    pulse: colors.pink,
    phase: colors.cyan,
    laser: colors.red,
    relic: colors.yellow,
    star: colors.green,
  }[type] || "#ffffff";
}

function draw(time) {
  const shake = state.screenShake > 0 ? state.screenShake : 0;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackground(time);
  drawHazards(time);
  drawPortals(time);
  drawFood(time);
  drawPowerups(time);
  drawSnake(time);
  drawBoss(time);
  drawParticles();
  drawShockwaves();
  drawFloaters();
  drawVignette();
  ctx.restore();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(47,255,209,${state.flash * 0.18})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground(time) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#03080b");
  g.addColorStop(0.55, "#07161a");
  g.addColorStop(1, "#170916");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  state.stars.forEach((star) => {
    const drift = (time * 0.012 * star.z) % W;
    const x = (star.x - drift + W) % W;
    const alpha = 0.2 + Math.sin(time * 0.002 + star.pulse) * 0.16 + star.z * 0.3;
    ctx.fillStyle = `rgba(210,255,248,${alpha})`;
    ctx.fillRect(x, star.y, 1.2 + star.z * 1.8, 1.2 + star.z * 1.8);
  });

  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += CELL) {
    const alpha = x % (CELL * 4) === 0 ? 0.14 : 0.055;
    ctx.strokeStyle = `rgba(47,255,209,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += CELL) {
    const alpha = y % (CELL * 4) === 0 ? 0.14 : 0.055;
    ctx.strokeStyle = `rgba(255,61,242,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  const scanY = (time * 0.04) % H;
  const scan = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
  scan.addColorStop(0, "rgba(47,255,209,0)");
  scan.addColorStop(0.5, "rgba(47,255,209,0.07)");
  scan.addColorStop(1, "rgba(47,255,209,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(0, scanY - 50, W, 100);
}

function drawRoundedCell(cell, color, radius = 8, scale = 0.82, alpha = 1) {
  const c = centerOf(cell);
  const size = CELL * scale;
  const x = c.x - size / 2;
  const y = c.y - size / 2;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  roundRect(x, y, size, size, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
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

function drawHazards(time) {
  state.hazards.forEach((hazard) => {
    const c = centerOf(hazard);
    const active = hazard.arm <= 0;
    const pulse = 0.5 + Math.sin(hazard.phase) * 0.5;
    const chaser = hazard.type === "chaser";
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(time * 0.002 + hazard.phase);
    ctx.strokeStyle = chaser ? colors.green : active ? colors.red : colors.orange;
    ctx.fillStyle = chaser ? "rgba(125,255,119,0.22)" : active ? "rgba(255,54,95,0.22)" : "rgba(255,229,92,0.18)";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = active ? 24 : 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const r = CELL * (0.36 + pulse * 0.12);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  state.gates.forEach((gate) => {
    const cells = gateCells(gate);
    ctx.strokeStyle = colors.pink;
    ctx.lineWidth = 5;
    ctx.shadowColor = colors.pink;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    cells.forEach((cell, index) => {
      const c = centerOf(cell);
      if (index === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    cells.forEach((cell) => drawRoundedCell(cell, "rgba(255,61,242,0.35)", 5, 0.52, 1));
  });
}

function drawPortals(time) {
  state.portals.forEach((portal, index) => {
    const c = centerOf(portal);
    const color = index % 2 ? colors.blue : colors.cyan;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(time * 0.003 + portal.pulse);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, CELL * 0.46, CELL * 0.25, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, CELL * 0.24, CELL * 0.46, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  });
}

function drawFood(time) {
  if (!state.food) return;
  const c = centerOf(state.food);
  const pulse = 1 + Math.sin(state.food.pulse) * 0.12;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(time * 0.002);
  const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, CELL * 0.7);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.35, colors.cyan);
  gradient.addColorStop(1, "rgba(47,255,209,0)");
  ctx.fillStyle = gradient;
  ctx.shadowColor = colors.cyan;
  ctx.shadowBlur = 28;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const r = CELL * (i % 2 ? 0.28 : 0.48) * pulse;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPowerups(time) {
  state.powerups.forEach((powerup) => {
    const c = centerOf(powerup);
    const color = powerupColor(powerup.type);
    const pulse = 1 + Math.sin(powerup.pulse) * 0.13;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(time * 0.003);
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}30`;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-CELL * 0.28 * pulse, -CELL * 0.28 * pulse, CELL * 0.56 * pulse, CELL * 0.56 * pulse);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function interpolatedSegment(index) {
  const current = state.snake[index] || state.snake[state.snake.length - 1];
  const prev = state.prevSnake[index] || current;
  const t = state.tickProgress;
  return {
    x: (prev.x + (current.x - prev.x) * t) * CELL + CELL / 2,
    y: (prev.y + (current.y - prev.y) * t) * CELL + CELL / 2,
  };
}

function drawSnake(time) {
  if (!state.snake.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass += 1) {
    ctx.beginPath();
    state.snake.forEach((_, index) => {
      const p = interpolatedSegment(index);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (pass === 0) {
      ctx.strokeStyle = state.phaseTime > 0 ? "rgba(82,167,255,0.38)" : "rgba(47,255,209,0.28)";
      ctx.lineWidth = CELL * 0.98;
      ctx.shadowColor = state.phaseTime > 0 ? colors.blue : colors.cyan;
      ctx.shadowBlur = 26;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, W, H);
      gradient.addColorStop(0, colors.cyan);
      gradient.addColorStop(0.5, colors.yellow);
      gradient.addColorStop(1, colors.pink);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = CELL * 0.64;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
  }

  state.snake.forEach((_, index) => {
    if (index === 0 || index % 3 !== 0) return;
    const p = interpolatedSegment(index);
    ctx.fillStyle = `rgba(255,255,255,${0.12 + Math.sin(time * 0.006 + index) * 0.06})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CELL * 0.12, 0, TAU);
    ctx.fill();
  });

  const head = interpolatedSegment(0);
  ctx.translate(head.x, head.y);
  const angle = Math.atan2(state.dir.y, state.dir.x);
  ctx.rotate(angle);
  ctx.fillStyle = "#f7fffb";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(CELL * 0.16, -CELL * 0.16, 3.2, 0, TAU);
  ctx.arc(CELL * 0.16, CELL * 0.16, 3.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBoss(time) {
  if (!state.boss) return;
  const boss = state.boss;
  const x = boss.x * CELL + CELL / 2 + Math.cos(boss.t * 1.3) * CELL * 1.4;
  const y = boss.y * CELL + CELL / 2 + Math.sin(boss.t * 1.7) * CELL * 0.9;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.0015);
  ctx.shadowColor = colors.orange;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = colors.orange;
  ctx.fillStyle = "rgba(255,138,42,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU;
    const r = CELL * (i % 2 ? 0.68 : 1.05);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x - 42, y + 43, 84, 6);
  ctx.fillStyle = colors.orange;
  ctx.fillRect(x - 42, y + 43, 84 * (boss.hp / boss.maxHp), 6);
}

function drawParticles() {
  state.particles.forEach((p) => {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, TAU);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawShockwaves() {
  state.shockwaves.forEach((s) => {
    const t = s.t / s.life;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 4 * (1 - t);
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * t, 0, TAU);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawFloaters() {
  state.floaters.forEach((f) => {
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "700 17px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.78);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.52)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  update(dt);
  draw(now);
  requestAnimationFrame(loop);
}

function bindEvents() {
  $("startButton").addEventListener("click", resetGame);
  $("restartButton").addEventListener("click", resetGame);
  $("nextButton").addEventListener("click", nextSector);
  $("boostButton").addEventListener("click", () => useAbility("boost"));
  $("focusButton").addEventListener("click", () => useAbility("focus"));
  $("pulseButton").addEventListener("click", () => useAbility("pulse"));
  $("phaseButton").addEventListener("click", () => useAbility("phase"));
  document.querySelectorAll(".upgrade-button").forEach((button) => {
    button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade));
  });
  document.querySelectorAll(".touch-pad button").forEach((button) => {
    button.addEventListener("click", () => queueDirection(button.dataset.dir));
  });
  bindFullscreenButton();
  bindMobileJoystick();
  bindMobileActions();

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const abilityKeys = { z: "boost", x: "focus", c: "pulse", v: "phase" };
    const upgradeKeys = { z: "engine", x: "magnet", c: "shield", v: "phase" };
    const map = {
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
    };
    if (map[key]) {
      event.preventDefault();
      queueDirection(map[key]);
    }
    if (state.mode === "sector") {
      if (upgradeKeys[key]) {
        event.preventDefault();
        buyUpgrade(upgradeKeys[key]);
      }
      if (key === "b" || key === "enter") {
        event.preventDefault();
        nextSector();
      }
      return;
    }
    if (abilityKeys[key]) {
      event.preventDefault();
      useAbility(abilityKeys[key]);
    }
    if (key === " " || key === "shift") {
      event.preventDefault();
      useAbility("boost");
    }
    if (key === "f") useAbility("focus");
    if (key === "e") useAbility("pulse");
    if (key === "q") useAbility("phase");
    if (key === "p" && state.mode === "playing") {
      state.paused = !state.paused;
      ui.statusLabel.textContent = state.paused ? "暫停" : "穩定";
    }
    if (key === "r") resetGame();
  });

  document.addEventListener("visibilitychange", () => {
    state.lastTime = performance.now();
  });
}

function bindFullscreenButton() {
  const button = $("fullscreenButton");
  if (!button) return;
  const stage = document.querySelector(".stage-wrap");
  const target = stage || document.documentElement;
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const appFullscreen = () => document.body.classList.contains("app-fullscreen");
  const lockLandscape = () => screen.orientation?.lock?.("landscape").catch(() => {});
  const unlockOrientation = () => screen.orientation?.unlock?.();
  const updateLabel = () => {
    const active = Boolean(fullscreenElement()) || appFullscreen();
    button.textContent = active ? "EXIT" : "FS";
    button.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  };
  const enterFallback = () => {
    document.body.classList.add("app-fullscreen");
    window.scrollTo(0, 0);
  };
  const exitFallback = () => {
    document.body.classList.remove("app-fullscreen");
    unlockOrientation();
  };
  button.addEventListener("click", async () => {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        exitFallback();
      } else if (appFullscreen()) {
        exitFallback();
      } else {
        const request = target.requestFullscreen || target.webkitRequestFullscreen;
        if (request) await request.call(target);
        else enterFallback();
        lockLandscape();
      }
    } catch {
      if (!fullscreenElement() && !appFullscreen()) enterFallback();
      lockLandscape();
    }
    updateLabel();
  });
  document.addEventListener("fullscreenchange", updateLabel);
  document.addEventListener("webkitfullscreenchange", updateLabel);
  updateLabel();
}

function bindMobileJoystick() {
  const stick = $("moveStick");
  if (!stick) return;
  const thumb = stick.querySelector("span");
  const usesRotatedStage = () =>
    window.innerHeight > window.innerWidth &&
    (document.body.classList.contains("app-fullscreen") || document.fullscreenElement || document.webkitFullscreenElement);
  let lastDirection = "";
  const reset = () => {
    lastDirection = "";
    thumb.style.transform = "translate(-50%, -50%)";
  };
  const move = (event) => {
    event.preventDefault();
    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = clamp((event.clientX - rect.left - radius) / radius, -1, 1);
    const dy = clamp((event.clientY - rect.top - radius) / radius, -1, 1);
    const gameX = usesRotatedStage() ? dy : dx;
    const gameY = usesRotatedStage() ? -dx : dy;
    const absX = Math.abs(gameX);
    const absY = Math.abs(gameY);
    const direction = Math.max(absX, absY) < 0.24 ? "" : absX > absY ? (gameX > 0 ? "right" : "left") : (gameY > 0 ? "down" : "up");
    thumb.style.transform = `translate(calc(-50% + ${dx * 24}px), calc(-50% + ${dy * 24}px))`;
    if (direction && direction !== lastDirection) {
      queueDirection(direction);
      lastDirection = direction;
    }
  };
  stick.addEventListener("pointerdown", (event) => {
    try {
      stick.setPointerCapture?.(event.pointerId);
    } catch {}
    move(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.buttons) move(event);
  });
  stick.addEventListener("pointerup", reset);
  stick.addEventListener("pointercancel", reset);
  stick.addEventListener("pointerleave", reset);
}

function bindMobileActions() {
  document.querySelectorAll("[data-mobile-ability]").forEach((button) => {
    button.addEventListener("click", () => useAbility(button.dataset.mobileAbility));
  });
}

createStars();
setupPreview();
bindEvents();
updateThreatText();
updateUi();
requestAnimationFrame((now) => {
  state.lastTime = now;
  loop(now);
});
