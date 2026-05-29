const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;
const MAX_PARTICLES = 280;
const MAX_FLOATERS = 24;
const MAX_SHOCKWAVES = 14;

const $ = (id) => document.getElementById(id);
const ui = {
  playerScore: $("playerScore"),
  cpuScore: $("cpuScore"),
  rally: $("rally"),
  league: $("league"),
  ballSpeed: $("ballSpeed"),
  streak: $("streak"),
  playerStatus: $("playerStatus"),
  playerText: $("playerText"),
  abilityStatus: $("abilityStatus"),
  abilityText: $("abilityText"),
  powerStatus: $("powerStatus"),
  powerText: $("powerText"),
  aiName: $("aiName"),
  aiText: $("aiText"),
  aiRead: $("aiRead"),
  aiReadText: $("aiReadText"),
  droneStatus: $("droneStatus"),
  droneText: $("droneText"),
  strikeCooldown: $("strikeCooldown"),
  focusCooldown: $("focusCooldown"),
  shieldCooldown: $("shieldCooldown"),
  startOverlay: $("startOverlay"),
  roundOverlay: $("roundOverlay"),
  matchOverlay: $("matchOverlay"),
  roundLabel: $("roundLabel"),
  roundTitle: $("roundTitle"),
  roundText: $("roundText"),
  matchLabel: $("matchLabel"),
  matchTitle: $("matchTitle"),
  matchText: $("matchText"),
  matchButton: $("matchButton"),
};

const colors = {
  cyan: "#2fffd1",
  pink: "#ff4bd8",
  yellow: "#ffe66b",
  orange: "#ff9a2f",
  red: "#ff4166",
  green: "#82ff74",
  blue: "#5cb8ff",
  white: "#f4fffb",
};

const opponents = [
  {
    name: "Vector-7",
    title: "中心守備型",
    text: "高速直線型 AI，會優先守住中心並反擊高球。",
    color: colors.pink,
    speed: 540,
    precision: 0.68,
    aggression: 0.46,
    droneCount: 1,
  },
  {
    name: "Mirage Unit",
    title: "假動作型",
    text: "會延遲讀球並突然加速，常把球削到角落。",
    color: colors.orange,
    speed: 610,
    precision: 0.78,
    aggression: 0.6,
    droneCount: 2,
  },
  {
    name: "Titan Core",
    title: "壓迫型",
    text: "支援機密度最高，會主動搶多球與強打反擊。",
    color: colors.red,
    speed: 690,
    precision: 0.86,
    aggression: 0.75,
    droneCount: 3,
  },
];

const powerups = {
  gravity: { label: "GRAVITY", color: colors.blue },
  blitz: { label: "BLITZ", color: colors.red },
  expand: { label: "擴拍", color: colors.green },
  multi: { label: "多球", color: colors.yellow },
  curve: { label: "曲球", color: colors.cyan },
  slow: { label: "慢速", color: colors.blue },
  shield: { label: "護盾", color: colors.orange },
};

const missionDefs = [
  { type: "rally", label: "穩住長回合", target: 5, reward: "獎勵：球門護盾 +1" },
  { type: "powerup", label: "搶下中央道具", target: 2, reward: "獎勵：Focus 重置並擴拍 8 秒" },
  { type: "strikeScore", label: "強打直接得分", target: 1, reward: "獎勵：勝分門檻 -1，護盾 +1" },
];

const state = {
  mode: "start",
  playerScore: 0,
  cpuScore: 0,
  targetScore: 7,
  leagueIndex: 0,
  winStreak: Number(localStorage.getItem("neonPongStreak") || 0),
  rally: 0,
  serving: 0,
  serveSide: "player",
  balls: [],
  powerItems: [],
  nextPower: 4,
  particles: [],
  floaters: [],
  shockwaves: [],
  stars: [],
  screenShake: 0,
  flash: 0,
  slowMo: 0,
  keys: new Set(),
  pointerY: null,
  player: null,
  cpu: null,
  drones: [],
  cooldowns: { strike: 0, focus: 0, shield: 0 },
  pendingStrike: 0,
  playerShield: 0,
  cpuShield: 0,
  playerExpand: 0,
  cpuExpand: 0,
  curveTime: 0,
  cpuCurveTime: 0,
  gravityWell: null,
  arenaPulse: 0,
  rallyDrama: false,
  matchAction: "restart",
  strikePointActive: false,
  mission: { progress: 0, complete: false },
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

function createPaddle(side) {
  const isPlayer = side === "player";
  return {
    side,
    x: isPlayer ? 54 : W - 78,
    y: H / 2,
    w: 18,
    h: 116,
    vy: 0,
    targetY: H / 2,
    color: isPlayer ? colors.cyan : opponents[state.leagueIndex].color,
    hitFlash: 0,
    dash: 0,
  };
}

function createStars() {
  state.stars = Array.from({ length: 150 }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    z: rand(0.25, 1),
    pulse: rand(0, TAU),
  }));
}

function resetMatch(full = true) {
  startAudio();
  playSfx("start");
  if (full) {
    state.playerScore = 0;
    state.cpuScore = 0;
    state.rally = 0;
    state.leagueIndex = 0;
  }
  state.mode = "playing";
  state.targetScore = 7;
  state.player = createPaddle("player");
  state.cpu = createPaddle("cpu");
  state.balls = [];
  state.powerItems = [];
  state.particles = [];
  state.floaters = [];
  state.shockwaves = [];
  state.cooldowns = { strike: 0, focus: 0, shield: 0 };
  state.pendingStrike = 0;
  state.playerShield = 0;
  state.cpuShield = 0;
  state.playerExpand = 0;
  state.cpuExpand = 0;
  state.curveTime = 0;
  state.cpuCurveTime = 0;
  state.gravityWell = null;
  state.arenaPulse = 0;
  state.rallyDrama = false;
  state.nextPower = 3.5;
  state.slowMo = 0;
  state.flash = 0.35;
  state.screenShake = 0;
  state.strikePointActive = false;
  state.mission = { progress: 0, complete: false };
  buildDrones();
  hideOverlays();
  serve("player");
  updateUi();
}

function resetPoint(scoringSide) {
  state.mode = "round";
  state.balls = [];
  state.powerItems = [];
  state.gravityWell = null;
  state.pendingStrike = 0;
  state.strikePointActive = false;
  state.playerShield = Math.max(0, state.playerShield - 1);
  state.cpuShield = Math.max(0, state.cpuShield - 1);
  state.serveSide = scoringSide === "player" ? "cpu" : "player";
  ui.roundLabel.textContent = "POINT";
  ui.roundTitle.textContent = scoringSide === "player" ? "玩家得分" : "電腦隊得分";
  ui.roundText.textContent = `目前 ${state.playerScore}:${state.cpuScore}，下一球由 ${state.serveSide === "player" ? "玩家" : "電腦隊"} 發球。`;
  ui.roundOverlay.classList.add("active");
  updateUi();
}

function continuePoint() {
  if (state.mode !== "round") return;
  ui.roundOverlay.classList.remove("active");
  state.mode = "playing";
  state.rally = 0;
  state.nextPower = 3;
  state.player.y = H / 2;
  state.cpu.y = H / 2;
  buildDrones();
  playSfx("serve");
  serve(state.serveSide);
}

function hideOverlays() {
  ui.startOverlay.classList.remove("active");
  ui.roundOverlay.classList.remove("active");
  ui.matchOverlay.classList.remove("active");
}

function buildDrones() {
  const opponent = opponents[state.leagueIndex];
  state.drones = [];
  for (let i = 0; i < opponent.droneCount; i += 1) {
    state.drones.push({
      x: W - 210 - i * 36,
      y: H * (0.32 + i * 0.18),
      r: 18,
      phase: rand(0, TAU),
      cooldown: rand(0.3, 1.4),
      color: opponent.color,
    });
  }
}

function serve(side = "player") {
  state.serving = 0.85;
  state.serveSide = side;
  const dir = side === "player" ? 1 : -1;
  const angle = rand(-0.34, 0.34);
  const speed = 510 + state.leagueIndex * 30;
  state.balls = [createBall(W / 2, H / 2, Math.cos(angle) * speed * dir, Math.sin(angle) * speed, side)];
  addFloater(side === "player" ? "PLAYER SERVE" : "CPU SERVE", W / 2, H / 2 - 55, side === "player" ? colors.cyan : opponents[state.leagueIndex].color);
}

function createBall(x, y, vx, vy, owner = "neutral") {
  return {
    x,
    y,
    vx,
    vy,
    r: 10,
    spin: 0,
    owner,
    lastHit: owner,
    speedCap: 900 + state.leagueIndex * 50,
    trail: [],
    hot: 0,
  };
}

function addParticle(x, y, color, count = 14, speed = 180, size = 3) {
  count = Math.min(count, Math.max(0, MAX_PARTICLES - state.particles.length));
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, TAU);
    const v = rand(speed * 0.25, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: rand(0.35, 0.9),
      maxLife: rand(0.55, 1.0),
      color,
      size: rand(size * 0.5, size * 1.5),
    });
  }
}

function addShockwave(x, y, color, radius = 120) {
  if (state.shockwaves.length >= MAX_SHOCKWAVES) state.shockwaves.shift();
  state.shockwaves.push({ x, y, color, radius, t: 0, life: 0.5 });
}

function addFloater(text, x, y, color = colors.white) {
  if (state.floaters.length >= MAX_FLOATERS) state.floaters.shift();
  state.floaters.push({ text, x, y, color, life: 1.05, vy: -34 });
}

function useAbility(name) {
  if (state.mode !== "playing") return;
  if (state.cooldowns[name] > 0) return;
  playSfx(name);
  if (name === "strike") {
    state.pendingStrike = 3.2;
    state.cooldowns.strike = 5.8;
    state.player.hitFlash = 1;
    addFloater("STRIKE READY", state.player.x + 60, state.player.y - 70, colors.yellow);
  }
  if (name === "focus") {
    state.slowMo = 2.8;
    state.cooldowns.focus = 12;
    state.flash = 0.25;
    addShockwave(state.player.x + 20, state.player.y, colors.blue, 230);
  }
  if (name === "shield") {
    state.playerShield = Math.min(2, state.playerShield + 1);
    state.cooldowns.shield = 10;
    addFloater("GOAL SHIELD", 92, state.player.y, colors.orange);
    addShockwave(40, state.player.y, colors.orange, 160);
  }
  updateUi();
}

function currentMission() {
  return missionDefs[state.leagueIndex] || missionDefs[0];
}

function advanceMission(type, amount = 1) {
  const mission = currentMission();
  if (state.mission.complete || mission.type !== type) return;
  state.mission.progress = mission.type === "rally"
    ? Math.max(state.mission.progress, amount)
    : state.mission.progress + amount;
  if (state.mission.progress >= mission.target) {
    state.mission.progress = mission.target;
    state.mission.complete = true;
    applyMissionReward(mission);
  }
  updateUi();
}

function applyMissionReward(mission) {
  if (mission.type === "rally") {
    state.playerShield = Math.min(3, state.playerShield + 1);
  } else if (mission.type === "powerup") {
    state.cooldowns.focus = 0;
    state.playerExpand = Math.max(state.playerExpand, 8);
  } else if (mission.type === "strikeScore") {
    state.targetScore = Math.max(5, state.targetScore - 1);
    state.playerShield = Math.min(3, state.playerShield + 1);
  }
  addFloater("MISSION REWARD", state.player.x + 90, state.player.y - 82, colors.yellow);
  addShockwave(state.player.x + 40, state.player.y, colors.yellow, 210);
  playSfx("powerup");
}

function update(dt) {
  if (state.mode !== "playing") {
    updateEffects(dt);
    return;
  }

  const timeScale = state.slowMo > 0 ? 0.52 : 1;
  const scaled = dt * timeScale;
  state.serving = Math.max(0, state.serving - scaled);
  updateTimers(scaled);
  updatePlayer(scaled);
  updateAi(scaled);
  updateDrones(scaled);
  updateBalls(scaled);
  updatePowerups(scaled);
  updateEffects(dt);
}

function updateTimers(dt) {
  Object.keys(state.cooldowns).forEach((key) => {
    state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
  });
  state.pendingStrike = Math.max(0, state.pendingStrike - dt);
  state.slowMo = Math.max(0, state.slowMo - dt);
  state.playerExpand = Math.max(0, state.playerExpand - dt);
  state.cpuExpand = Math.max(0, state.cpuExpand - dt);
  state.curveTime = Math.max(0, state.curveTime - dt);
  state.cpuCurveTime = Math.max(0, state.cpuCurveTime - dt);
  state.arenaPulse = Math.max(0, state.arenaPulse - dt);
  if (state.gravityWell) {
    state.gravityWell.life -= dt;
    state.gravityWell.phase += dt * 3.8;
    if (state.gravityWell.life <= 0) state.gravityWell = null;
  }
  state.player.hitFlash = Math.max(0, state.player.hitFlash - dt * 3);
  state.cpu.hitFlash = Math.max(0, state.cpu.hitFlash - dt * 3);
  state.nextPower -= dt;
  if (state.nextPower <= 0 && state.powerItems.length < 2) {
    spawnPowerup();
    state.nextPower = rand(6, 9);
  }
}

function updatePlayer(dt) {
  const paddle = state.player;
  const baseSpeed = state.pendingStrike > 0 ? 620 : 710;
  let input = 0;
  if (state.keys.has("w") || state.keys.has("arrowup")) input -= 1;
  if (state.keys.has("s") || state.keys.has("arrowdown")) input += 1;
  if (state.pointerY !== null) {
    const delta = state.pointerY - paddle.y;
    input = clamp(delta / 90, -1, 1);
  }
  paddle.vy = input * baseSpeed;
  paddle.y = clamp(paddle.y + paddle.vy * dt, paddleHeight(paddle) / 2 + 18, H - paddleHeight(paddle) / 2 - 18);
}

function updateAi(dt) {
  const cpu = state.cpu;
  const opponent = opponents[state.leagueIndex];
  const targetBall = state.balls
    .filter((ball) => ball.vx > -120)
    .sort((a, b) => b.x - a.x)[0] || state.balls[0];
  let target = H / 2;
  if (targetBall) {
    target = predictBallY(targetBall, cpu.x);
    const error = (1 - opponent.precision) * 180;
    target += Math.sin(performance.now() * 0.002 + state.rally) * error;
    if (state.rally > 7 && chance(opponent.aggression * dt)) {
      target += Math.sign(targetBall.vy || 1) * 75;
    }
  }
  cpu.targetY = clamp(target, 70, H - 70);
  const diff = cpu.targetY - cpu.y;
  const maxMove = opponent.speed * (state.slowMo > 0 ? 0.88 : 1) * dt;
  cpu.y += clamp(diff, -maxMove, maxMove);
  cpu.y = clamp(cpu.y, paddleHeight(cpu) / 2 + 18, H - paddleHeight(cpu) / 2 - 18);
  cpu.vy = clamp(diff * 5, -opponent.speed, opponent.speed);
  if (state.cpuShield <= 0 && state.cpuScore < state.playerScore && chance(dt * 0.13 * opponent.aggression)) {
    state.cpuShield = 1;
    addFloater("CPU SHIELD", W - 95, cpu.y, opponent.color);
  }
}

function predictBallY(ball, targetX) {
  if (Math.abs(ball.vx) < 1) return ball.y;
  let t = (targetX - ball.x) / ball.vx;
  if (t < 0) t = 0.25;
  let y = ball.y + ball.vy * t + ball.spin * 90 * t;
  const span = H - 42;
  y = Math.abs(((y - 21) % (span * 2) + span * 2) % (span * 2));
  if (y > span) y = span * 2 - y;
  return y + 21;
}

function updateDrones(dt) {
  const opponent = opponents[state.leagueIndex];
  state.drones.forEach((drone, index) => {
    drone.phase += dt * (1.2 + index * 0.2);
    drone.cooldown = Math.max(0, drone.cooldown - dt);
    const lead = state.balls[0] || { y: H / 2 };
    const lane = H * (0.25 + index * 0.2) + Math.sin(drone.phase) * 58;
    const desired = state.rally > 4 ? (lane + lead.y) / 2 : lane;
    drone.y += clamp(desired - drone.y, -opponent.speed * 0.45 * dt, opponent.speed * 0.45 * dt);
    drone.y = clamp(drone.y, 58, H - 58);
  });
}

function updateBalls(dt) {
  for (let i = state.balls.length - 1; i >= 0; i -= 1) {
    const ball = state.balls[i];
    ball.hot = Math.max(0, ball.hot - dt);
    if (state.serving > 0) {
      ball.x = W / 2;
      ball.y = H / 2 + Math.sin(performance.now() * 0.006) * 12;
      continue;
    }
    if (state.gravityWell) {
      const dx = state.gravityWell.x - ball.x;
      const dy = state.gravityWell.y - ball.y;
      const dist = Math.max(80, Math.hypot(dx, dy));
      const pull = 85000 / (dist * dist);
      ball.vx += (dx / dist) * pull;
      ball.vy += (dy / dist) * pull;
      ball.hot = Math.max(ball.hot, 0.45);
    }
    ball.vy += ball.spin * 150 * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > ball.speedCap) {
      ball.vx = (ball.vx / speed) * ball.speedCap;
      ball.vy = (ball.vy / speed) * ball.speedCap;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.trail.push({ x: ball.x, y: ball.y, life: 0.45 });
    if (ball.trail.length > 18) ball.trail.shift();
    ball.trail.forEach((p) => p.life -= dt);
    ball.trail = ball.trail.filter((p) => p.life > 0);

    if (ball.y - ball.r < 16) {
      ball.y = 16 + ball.r;
      ball.vy = Math.abs(ball.vy);
      wallBounce(ball, colors.cyan);
    }
    if (ball.y + ball.r > H - 16) {
      ball.y = H - 16 - ball.r;
      ball.vy = -Math.abs(ball.vy);
      wallBounce(ball, colors.pink);
    }

    if (paddleCollision(ball, state.player) && ball.vx < 0) hitPaddle(ball, state.player, 1);
    if (paddleCollision(ball, state.cpu) && ball.vx > 0) hitPaddle(ball, state.cpu, -1);
    state.drones.forEach((drone) => {
      if (drone.cooldown <= 0 && circleCollision(ball, drone)) {
        hitDrone(ball, drone);
      }
    });
    collectPowerups(ball);

    if (ball.x < -45) {
      if (state.playerShield > 0) {
        state.playerShield -= 1;
        shieldSave(ball, "player");
      } else {
        scorePoint("cpu");
        return;
      }
    }
    if (ball.x > W + 45) {
      if (state.cpuShield > 0) {
        state.cpuShield -= 1;
        shieldSave(ball, "cpu");
      } else {
        scorePoint("player");
        return;
      }
    }
  }
}

function wallBounce(ball, color) {
  ball.spin *= 0.82;
  addParticle(ball.x, ball.y, color, 8, 120, 2);
  playSfx("wall");
}

function paddleHeight(paddle) {
  const expanded = paddle.side === "player" ? state.playerExpand > 0 : state.cpuExpand > 0;
  return paddle.h + (expanded ? 52 : 0);
}

function paddleCollision(ball, paddle) {
  const h = paddleHeight(paddle);
  return ball.x + ball.r > paddle.x &&
    ball.x - ball.r < paddle.x + paddle.w &&
    ball.y + ball.r > paddle.y - h / 2 &&
    ball.y - ball.r < paddle.y + h / 2;
}

function circleCollision(ball, drone) {
  const dx = ball.x - drone.x;
  const dy = ball.y - drone.y;
  return Math.hypot(dx, dy) < ball.r + drone.r;
}

function hitPaddle(ball, paddle, dir) {
  const h = paddleHeight(paddle);
  const offset = clamp((ball.y - paddle.y) / (h / 2), -1, 1);
  const baseSpeed = Math.hypot(ball.vx, ball.vy);
  const side = paddle.side;
  const strike = side === "player" && state.pendingStrike > 0;
  const cpuCurve = side === "cpu" && state.cpuCurveTime > 0;
  const playerCurve = side === "player" && state.curveTime > 0;
  const boost = strike ? 1.28 : side === "cpu" && state.rally > 8 ? 1.08 : 1.04;
  const speed = clamp(baseSpeed * boost + 24 + state.rally * 3, 500, ball.speedCap);
  const angle = offset * 0.92 + (paddle.vy / 950) * 0.22;
  ball.vx = Math.cos(angle) * speed * dir;
  ball.vy = Math.sin(angle) * speed + paddle.vy * 0.12;
  ball.x = dir > 0 ? paddle.x + paddle.w + ball.r + 1 : paddle.x - ball.r - 1;
  ball.spin = offset * 2.1 + (paddle.vy / 720);
  if (playerCurve || cpuCurve) ball.spin *= 1.85;
  ball.lastHit = side;
  ball.owner = side;
  ball.hot = strike ? 1.2 : 0.35;
  state.rally += 1;
  if (side === "player") advanceMission("rally", state.rally);
  if (side === "cpu") state.strikePointActive = false;
  if (state.rally >= 10 && !state.rallyDrama) triggerRallyDrama(ball);
  paddle.hitFlash = 1;
  const color = side === "player" ? colors.cyan : opponents[state.leagueIndex].color;
  addParticle(ball.x, ball.y, strike ? colors.yellow : color, strike ? 34 : 18, strike ? 340 : 210, strike ? 5 : 3);
  addShockwave(ball.x, ball.y, strike ? colors.yellow : color, strike ? 190 : 105);
  if (strike) {
    state.pendingStrike = 0;
    state.strikePointActive = true;
    state.screenShake = 9;
    addFloater("POWER SHOT", ball.x + 35, ball.y - 25, colors.yellow);
    playSfx("powerHit");
  } else {
    state.screenShake = Math.min(6, 1.5 + state.rally * 0.08);
    playSfx(side === "player" ? "paddle" : "cpuPaddle");
  }
  updateUi();
}

function triggerRallyDrama(ball) {
  state.rallyDrama = true;
  const x = W / 2 + rand(-90, 90);
  const y = H / 2 + rand(-120, 120);
  state.gravityWell = { x, y, life: 4.6, phase: 0, color: colors.blue };
  state.arenaPulse = 0.55;
  state.flash = 0.35;
  state.screenShake = 7;
  ball.hot = Math.max(ball.hot, 1.1);
  addFloater("RIFT RALLY", x, y - 38, colors.blue);
  addShockwave(x, y, colors.blue, 260);
  spawnPowerup();
  playSfx("gravity");
}

function hitDrone(ball, drone) {
  const dx = ball.x - drone.x;
  const dy = ball.y - drone.y;
  const angle = Math.atan2(dy, dx);
  const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.04, 480, ball.speedCap);
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  ball.spin += Math.sin(drone.phase) * 0.8;
  ball.lastHit = "cpu";
  ball.owner = "cpu";
  drone.cooldown = 0.75;
  addParticle(drone.x, drone.y, drone.color, 16, 210, 3);
  addShockwave(drone.x, drone.y, drone.color, 95);
  playSfx("drone");
}

function shieldSave(ball, side) {
  const dir = side === "player" ? 1 : -1;
  const x = side === "player" ? 32 : W - 32;
  ball.x = x;
  ball.vx = Math.abs(ball.vx) * dir;
  ball.vy += rand(-90, 90);
  ball.lastHit = side;
  ball.owner = side;
  const color = side === "player" ? colors.orange : opponents[state.leagueIndex].color;
  addParticle(x, ball.y, color, 30, 270, 4);
  addShockwave(x, ball.y, color, 180);
  addFloater("SAVE", x + dir * 45, ball.y - 35, color);
  state.screenShake = 8;
  playSfx("save");
}

function scorePoint(side) {
  state.gravityWell = null;
  if (side === "player") state.playerScore += 1;
  else state.cpuScore += 1;
  if (side === "player" && state.strikePointActive) advanceMission("strikeScore", 1);
  const x = side === "player" ? W - 65 : 65;
  addShockwave(x, H / 2, side === "player" ? colors.cyan : colors.red, 320);
  addParticle(x, H / 2, side === "player" ? colors.cyan : colors.red, 70, 360, 5);
  state.flash = 0.4;
  state.screenShake = 12;
  playSfx(side === "player" ? "score" : "concede");
  updateUi();
  if (state.playerScore >= state.targetScore || state.cpuScore >= state.targetScore) {
    finishMatch(side);
  } else {
    resetPoint(side);
  }
}

function finishMatch(winner) {
  state.mode = "match";
  ui.matchOverlay.classList.add("active");
  const won = winner === "player";
  playSfx(won ? "win" : "lose");
  if (won) {
    if (state.leagueIndex < opponents.length - 1) {
      state.matchAction = "nextOpponent";
      ui.matchLabel.textContent = "OPPONENT DEFEATED";
      ui.matchTitle.textContent = `${opponents[state.leagueIndex].name} 擊破`;
      ui.matchText.textContent = "下一名電腦隊主將已上場，速度、預判與支援機都會提升。";
      ui.matchButton.textContent = "挑戰下一名";
    } else {
      state.matchAction = "restart";
      state.winStreak += 1;
      localStorage.setItem("neonPongStreak", String(state.winStreak));
      ui.matchLabel.textContent = "LEAGUE CHAMPION";
      ui.matchTitle.textContent = "聯盟制霸";
      ui.matchText.textContent = `你以 ${state.playerScore}:${state.cpuScore} 擊敗整支電腦隊。連勝紀錄 ${state.winStreak}。`;
      ui.matchButton.textContent = "重新挑戰";
    }
  } else {
    state.matchAction = "restart";
    ui.matchLabel.textContent = "CPU TEAM WINS";
    ui.matchTitle.textContent = "電腦隊守住聯盟";
    ui.matchText.textContent = `${opponents[state.leagueIndex].name} 以 ${state.cpuScore}:${state.playerScore} 拿下比賽。`;
    ui.matchButton.textContent = "重新開始";
  }
  updateUi();
}

function handleMatchButton() {
  if (state.matchAction === "nextOpponent") {
    state.leagueIndex += 1;
    state.playerScore = 0;
    state.cpuScore = 0;
    resetMatch(false);
  } else {
    resetMatch(true);
  }
}

function spawnPowerup() {
  const keys = Object.keys(powerups);
  const type = keys[Math.floor(rand(0, keys.length))];
  state.powerItems.push({
    type,
    x: rand(W * 0.34, W * 0.66),
    y: rand(110, H - 110),
    r: 18,
    life: 9,
    phase: rand(0, TAU),
  });
  ui.powerStatus.textContent = powerups[type].label;
}

function updatePowerups(dt) {
  state.powerItems.forEach((item) => {
    item.life -= dt;
    item.phase += dt * 4;
  });
  state.powerItems = state.powerItems.filter((item) => item.life > 0);
}

function collectPowerups(ball) {
  for (let i = state.powerItems.length - 1; i >= 0; i -= 1) {
    const item = state.powerItems[i];
    const dx = ball.x - item.x;
    const dy = ball.y - item.y;
    if (Math.hypot(dx, dy) <= ball.r + item.r) {
      state.powerItems.splice(i, 1);
      const side = ball.lastHit === "cpu" ? "cpu" : "player";
      applyPowerup(item.type, side, item.x, item.y);
      if (side === "player") advanceMission("powerup", 1);
    }
  }
}

function applyPowerup(type, side, x, y) {
  const playerSide = side === "player";
  const color = playerSide ? colors.cyan : opponents[state.leagueIndex].color;
  if (type === "expand") {
    if (playerSide) state.playerExpand = 7;
    else state.cpuExpand = 7;
  }
  if (type === "multi") {
    const seed = state.balls[0] || createBall(W / 2, H / 2, 500, 0, side);
    const dir = playerSide ? 1 : -1;
    state.balls.push(createBall(seed.x, seed.y, 520 * dir, -260, side));
    state.balls.push(createBall(seed.x, seed.y, 520 * dir, 260, side));
    if (state.balls.length > 5) state.balls.splice(0, state.balls.length - 5);
  }
  if (type === "curve") {
    if (playerSide) state.curveTime = 8;
    else state.cpuCurveTime = 8;
  }
  if (type === "slow") {
    if (playerSide) state.slowMo = 2.2;
    else {
      state.balls.forEach((ball) => {
        ball.vx *= 0.78;
        ball.vy *= 0.78;
      });
    }
  }
  if (type === "shield") {
    if (playerSide) state.playerShield = Math.min(2, state.playerShield + 1);
    else state.cpuShield = Math.min(2, state.cpuShield + 1);
  }
  if (type === "gravity") {
    state.gravityWell = { x, y, life: 6.5, phase: 0, color: powerups[type].color };
    state.arenaPulse = 0.45;
  }
  if (type === "blitz") {
    const dir = playerSide ? 1 : -1;
    const lane = playerSide ? state.player.y : state.cpu.y;
    state.balls.push(createBall(playerSide ? state.player.x + 38 : state.cpu.x - 18, lane, 760 * dir, rand(-180, 180), side));
    state.balls[state.balls.length - 1].hot = 1.2;
    if (state.balls.length > 5) state.balls.splice(0, state.balls.length - 5);
    state.screenShake = 8;
  }
  addFloater(powerups[type].label, x, y - 28, color);
  addParticle(x, y, powerups[type].color, 30, 260, 4);
  addShockwave(x, y, powerups[type].color, 150);
  playSfx("powerup");
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
    compressor.threshold.value = -20;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    master.gain.value = 0.28;
    music.gain.value = 0.1;
    music.connect(compressor);
    compressor.connect(master);
    master.connect(audioCtx.destination);
    state.audio.ctx = audioCtx;
    state.audio.master = compressor;
    state.audio.music = music;
  }
  state.audio.ctx.resume?.();
  state.audio.enabled = true;
  if (!state.audio.timer) state.audio.timer = window.setInterval(scheduleMusic, 170);
}

function scheduleMusic() {
  const audio = state.audio;
  if (!audio.ctx || audio.ctx.state !== "running" || !["playing", "round", "match"].includes(state.mode)) return;
  const step = audio.step % 32;
  const now = audio.ctx.currentTime + 0.035;
  const bass = [98, 98, 123, 123, 110, 110, 147, 147];
  const blip = [392, 0, 523, 0, 659, 0, 523, 0, 330, 0, 494, 0, 587, 0, 494, 0];
  if (step % 4 === 0) playTone(bass[(step / 4) % bass.length], 0.16, "triangle", 0.05, now, audio.music);
  if (blip[step % blip.length]) playTone(blip[step % blip.length], 0.055, "square", 0.032, now, audio.music);
  if (step % 8 === 4) playNoise(0.025, 0.012, now, audio.music);
  audio.step += 1;
}

function playTone(freq, duration = 0.07, type = "sine", gainValue = 0.055, when = 0, destination = null) {
  const audio = state.audio;
  if (!audio.ctx || !audio.enabled) return;
  const audioCtx = audio.ctx;
  const start = when || audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(24, freq), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(destination || audio.master);
  osc.start(start);
  osc.stop(start + duration + 0.025);
}

function playNoise(duration = 0.06, gainValue = 0.035, when = 0, destination = null) {
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
  filter.frequency.setValueAtTime(1800, start);
  filter.Q.setValueAtTime(4, start);
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
  if (name === "start") [294, 440, 588, 880].forEach((freq, i) => playTone(freq, 0.075, "square", 0.052, now + i * 0.04));
  if (name === "serve") playTone(520, 0.08, "triangle", 0.045, now);
  if (name === "wall") playTone(260, 0.035, "square", 0.026, now);
  if (name === "paddle") playTone(620 + state.rally * 6, 0.05, "square", 0.048, now);
  if (name === "cpuPaddle") playTone(420 + state.rally * 5, 0.05, "sawtooth", 0.04, now);
  if (name === "powerHit") {
    playTone(170, 0.12, "sawtooth", 0.07, now);
    playTone(920, 0.08, "square", 0.052, now + 0.025);
  }
  if (name === "drone") playTone(360, 0.055, "triangle", 0.04, now);
  if (name === "save" || name === "shield") [330, 495].forEach((freq, i) => playTone(freq, 0.1, "triangle", 0.055, now + i * 0.05));
  if (name === "score") [523, 784, 1046].forEach((freq, i) => playTone(freq, 0.09, "square", 0.055, now + i * 0.055));
  if (name === "concede") [220, 165].forEach((freq, i) => playTone(freq, 0.13, "sawtooth", 0.052, now + i * 0.075));
  if (name === "strike") [880, 1175].forEach((freq, i) => playTone(freq, 0.07, "square", 0.052, now + i * 0.045));
  if (name === "focus") playTone(392, 0.16, "triangle", 0.052, now);
  if (name === "powerup") [660, 990].forEach((freq, i) => playTone(freq, 0.075, "sine", 0.048, now + i * 0.045));
  if (name === "win") [392, 523, 659, 1046].forEach((freq, i) => playTone(freq, 0.11, "square", 0.058, now + i * 0.07));
  if (name === "lose") [196, 147, 110].forEach((freq, i) => playTone(freq, 0.16, "sawtooth", 0.058, now + i * 0.09));
}

function updateEffects(dt) {
  state.particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.982;
    p.vy *= 0.982;
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
  state.screenShake = Math.max(0, state.screenShake - dt * 16);
  state.flash = Math.max(0, state.flash - dt * 1.7);
}

function updateUi() {
  const fastest = state.balls.reduce((max, ball) => Math.max(max, Math.hypot(ball.vx, ball.vy)), 0);
  const opponent = opponents[state.leagueIndex];
  ui.playerScore.textContent = state.playerScore.toString();
  ui.cpuScore.textContent = state.cpuScore.toString();
  ui.rally.textContent = state.rally.toString();
  ui.league.textContent = `${state.leagueIndex + 1}/${opponents.length}`;
  ui.ballSpeed.textContent = Math.round(fastest).toString();
  ui.streak.textContent = state.winStreak.toString();
  const mission = currentMission();
  ui.playerStatus.textContent = state.mission.complete ? `${mission.label} 完成` : mission.label;
  ui.playerText.textContent = `進度 ${state.mission.progress}/${mission.target}｜${mission.reward}`;
  ui.abilityStatus.textContent = `${readyCount()} 招可用`;
  ui.abilityText.textContent = `Z Strike ${formatCooldown(state.cooldowns.strike)}｜X Focus ${formatCooldown(state.cooldowns.focus)}｜C Shield ${formatCooldown(state.cooldowns.shield)}｜V Serve｜B Pause`;
  ui.powerStatus.textContent = state.powerItems.length ? state.powerItems.map((p) => powerups[p.type].label).join("、") : "準備中";
  ui.powerText.textContent = state.powerItems.length ? "讓球碰到中央道具，最後擊球方會取得效果。" : `下一個道具約 ${Math.ceil(state.nextPower)} 秒。`;
  ui.aiName.textContent = opponent.name;
  ui.aiText.textContent = `${opponent.title}：${opponent.text}`;
  ui.aiRead.textContent = state.rally > 9 ? "高壓預判" : state.rally > 4 ? "積極攔截" : "校準中";
  ui.aiReadText.textContent = `速度 ${opponent.speed}，精準度 ${Math.round(opponent.precision * 100)}%，侵略性 ${Math.round(opponent.aggression * 100)}%。`;
  ui.droneStatus.textContent = `${opponent.droneCount} 台`;
  ui.droneText.textContent = opponent.droneCount > 1 ? "支援機會在右半場補位並反彈來球。" : "單支援機會守住電腦隊空檔。";
  ui.strikeCooldown.textContent = formatCooldown(state.cooldowns.strike);
  ui.focusCooldown.textContent = formatCooldown(state.cooldowns.focus);
  ui.shieldCooldown.textContent = formatCooldown(state.cooldowns.shield);
  $("strikeButton").disabled = state.cooldowns.strike > 0;
  $("focusButton").disabled = state.cooldowns.focus > 0;
  $("shieldButton").disabled = state.cooldowns.shield > 0;
  window.__pongDiagnostics = {
    mode: state.mode,
    playerScore: state.playerScore,
    cpuScore: state.cpuScore,
    balls: state.balls.length,
    rally: state.rally,
    leagueIndex: state.leagueIndex,
  };
}

function readyCount() {
  return Object.values(state.cooldowns).filter((v) => v <= 0).length;
}

function formatCooldown(value) {
  return value <= 0 ? "Ready" : `${value.toFixed(1)}s`;
}

function draw(now) {
  const shake = state.screenShake;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawCourt(now);
  drawGoalShields();
  drawGravityWell(now);
  drawDrones(now);
  drawPowerups(now);
  drawPaddle(state.player, now);
  drawPaddle(state.cpu, now);
  drawBalls(now);
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

function drawCourt(now) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#020607");
  bg.addColorStop(0.55, "#071411");
  bg.addColorStop(1, "#16080f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (state.arenaPulse > 0) {
    ctx.fillStyle = `rgba(92,184,255,${state.arenaPulse * 0.16})`;
    ctx.fillRect(0, 0, W, H);
  }

  state.stars.forEach((star) => {
    const x = (star.x - now * 0.008 * star.z + W) % W;
    const alpha = 0.18 + star.z * 0.3 + Math.sin(now * 0.002 + star.pulse) * 0.08;
    ctx.fillStyle = `rgba(230,255,249,${alpha})`;
    ctx.fillRect(x, star.y, 1 + star.z * 1.7, 1 + star.z * 1.7);
  });

  ctx.strokeStyle = "rgba(47,255,209,0.08)";
  ctx.lineWidth = 1;
  for (let x = 80; x < W; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 16);
    ctx.lineTo(x, H - 16);
    ctx.stroke();
  }
  for (let y = 64; y < H; y += 64) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(W - 20, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.setLineDash([18, 18]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, 30);
  ctx.lineTo(W / 2, H - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(47,255,209,0.36)";
  ctx.lineWidth = 2;
  roundRect(20, 18, W - 40, H - 36, 10);
  ctx.stroke();

  ctx.font = "800 92px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fillText(`${state.playerScore} : ${state.cpuScore}`, W / 2, 120);
}

function drawGoalShields() {
  if (state.playerShield > 0) drawShieldWall(38, colors.orange, state.playerShield);
  if (state.cpuShield > 0) drawShieldWall(W - 38, opponents[state.leagueIndex].color, state.cpuShield);
}

function drawGravityWell(now) {
  if (!state.gravityWell) return;
  const well = state.gravityWell;
  const pulse = 1 + Math.sin(now * 0.01 + well.phase) * 0.14;
  ctx.save();
  ctx.translate(well.x, well.y);
  ctx.strokeStyle = well.color;
  ctx.fillStyle = "rgba(92,184,255,0.13)";
  ctx.shadowColor = well.color;
  ctx.shadowBlur = 28;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, (38 + i * 22) * pulse, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 22 * pulse, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawShieldWall(x, color, charges) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.45 + charges * 0.15;
  ctx.beginPath();
  ctx.moveTo(x, 95);
  ctx.lineTo(x, H - 95);
  ctx.stroke();
  ctx.restore();
}

function drawPaddle(paddle, now) {
  const h = paddleHeight(paddle);
  const pulse = 1 + paddle.hitFlash * 0.18;
  const x = paddle.x;
  const y = paddle.y - h / 2;
  const color = paddle.side === "player" ? colors.cyan : opponents[state.leagueIndex].color;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22 + paddle.hitFlash * 18;
  const grad = ctx.createLinearGradient(x, y, x + paddle.w, y + h);
  grad.addColorStop(0, colors.white);
  grad.addColorStop(0.42, color);
  grad.addColorStop(1, paddle.side === "player" ? colors.green : colors.pink);
  ctx.fillStyle = grad;
  roundRect(x - (pulse - 1) * 8, y - (pulse - 1) * 8, paddle.w + (pulse - 1) * 16, h + (pulse - 1) * 16, 9);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 4, paddle.y - h * 0.33, 3, h * 0.66);
  if (paddle.side === "player" && state.pendingStrike > 0) {
    ctx.strokeStyle = colors.yellow;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.65 + Math.sin(now * 0.018) * 0.25;
    roundRect(x - 8, y - 8, paddle.w + 16, h + 16, 13);
    ctx.stroke();
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

function drawBalls(now) {
  state.balls.forEach((ball) => {
    ball.trail.forEach((p, index) => {
      const alpha = (index / Math.max(1, ball.trail.length)) * 0.42 * p.life;
      ctx.fillStyle = ball.lastHit === "cpu" ? `rgba(255,75,216,${alpha})` : `rgba(47,255,209,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ball.r * (0.5 + index / ball.trail.length), 0, TAU);
      ctx.fill();
    });
    const color = ball.hot > 0.6 ? colors.yellow : ball.lastHit === "cpu" ? opponents[state.leagueIndex].color : colors.cyan;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(now * 0.012 + ball.spin);
    ctx.shadowColor = color;
    ctx.shadowBlur = 24 + ball.hot * 18;
    const grad = ctx.createRadialGradient(-4, -5, 2, 0, 0, ball.r * 1.6);
    grad.addColorStop(0, colors.white);
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r * (1 + ball.hot * 0.12), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r * 0.72, -0.8, 1.2);
    ctx.stroke();
    ctx.restore();
  });
}

function drawDrones(now) {
  state.drones.forEach((drone, index) => {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    ctx.rotate(now * 0.003 + drone.phase);
    ctx.strokeStyle = drone.color;
    ctx.fillStyle = `rgba(255,255,255,${drone.cooldown > 0 ? 0.08 : 0.16})`;
    ctx.shadowColor = drone.color;
    ctx.shadowBlur = drone.cooldown > 0 ? 9 : 22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const r = drone.r * (i % 2 ? 0.68 : 1);
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
}

function drawPowerups(now) {
  state.powerItems.forEach((item) => {
    const meta = powerups[item.type];
    const pulse = 1 + Math.sin(item.phase) * 0.12;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(now * 0.003);
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = meta.color;
    ctx.fillStyle = `${meta.color}2f`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-item.r * pulse, -item.r * pulse, item.r * 2 * pulse, item.r * 2 * pulse);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-now * 0.006);
    ctx.fillStyle = colors.white;
    ctx.font = "800 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(meta.label, 0, 4);
    ctx.restore();
  });
}

function drawParticles() {
  state.particles.forEach((p) => {
    const alpha = Math.max(0, p.life / p.maxLife);
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
    ctx.lineWidth = Math.max(1, 4 * (1 - t));
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
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.font = "800 17px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.82);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.56)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function quickServe() {
  if (state.mode === "playing" && state.serving > 0) state.serving = 0;
}

function bindEvents() {
  $("startButton").addEventListener("click", () => resetMatch(true));
  $("continueButton").addEventListener("click", continuePoint);
  $("matchButton").addEventListener("click", handleMatchButton);
  $("strikeButton").addEventListener("click", () => useAbility("strike"));
  $("focusButton").addEventListener("click", () => useAbility("focus"));
  $("shieldButton").addEventListener("click", () => useAbility("shield"));
  $("serveButton").addEventListener("click", quickServe);
  bindFullscreenButton();
  bindMobileActions();

  document.querySelectorAll(".touch-zone button").forEach((button) => {
    button.addEventListener("pointerdown", () => {
      const action = button.dataset.touch;
      if (action === "up") state.keys.add("arrowup");
      if (action === "down") state.keys.add("arrowdown");
      if (action === "strike") useAbility("strike");
      if (action === "shield") useAbility("shield");
    });
    button.addEventListener("pointerup", () => {
      state.keys.delete("arrowup");
      state.keys.delete("arrowdown");
    });
    button.addEventListener("pointerleave", () => {
      state.keys.delete("arrowup");
      state.keys.delete("arrowdown");
    });
    button.addEventListener("pointercancel", () => {
      state.keys.delete("arrowup");
      state.keys.delete("arrowdown");
    });
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["w", "s", "arrowup", "arrowdown", " ", "z", "x", "c", "v", "b"].includes(key)) event.preventDefault();
    state.keys.add(key);
    if (key === "z") useAbility("strike");
    if (key === "x") useAbility("focus");
    if (key === "c") useAbility("shield");
    if (key === "v") quickServe();
    if (key === " " || key === "shift") useAbility("strike");
    if (key === "f") useAbility("focus");
    if (key === "e") useAbility("shield");
    if (key === "enter") {
      if (state.mode === "start") resetMatch(true);
      else if (state.mode === "round") continuePoint();
      else if (state.mode === "match") handleMatchButton();
    }
    if (key === "r") resetMatch(true);
    if ((key === "p" || key === "b") && state.mode === "playing") state.mode = "paused";
    else if ((key === "p" || key === "b") && state.mode === "paused") state.mode = "playing";
  });
  window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointerY = ((event.clientY - rect.top) / rect.height) * H;
  });
  canvas.addEventListener("pointerleave", () => {
    state.pointerY = null;
  });
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    state.pointerY = ((event.clientY - rect.top) / rect.height) * H;
    if (state.mode === "start") resetMatch(true);
    if (state.mode === "round") continuePoint();
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
      }
    } catch {
      if (!fullscreenElement() && !appFullscreen()) enterFallback();
    }
    updateLabel();
  });
  document.addEventListener("fullscreenchange", updateLabel);
  document.addEventListener("webkitfullscreenchange", updateLabel);
  updateLabel();
}

function bindMobileActions() {
  document.querySelectorAll("[data-mobile-ability], [data-mobile-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.mobileAbility) useAbility(button.dataset.mobileAbility);
      if (button.dataset.mobileAction === "serve") quickServe();
    });
  });
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  update(dt);
  draw(now);
  requestAnimationFrame(loop);
}

createStars();
state.player = createPaddle("player");
state.cpu = createPaddle("cpu");
buildDrones();
serve("player");
state.mode = "start";
state.serving = 999;
bindEvents();
updateUi();
requestAnimationFrame((now) => {
  state.lastTime = now;
  loop(now);
});
