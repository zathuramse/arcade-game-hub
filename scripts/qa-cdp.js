#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GAMES = [
  {
    name: "space-bee-shooter",
    path: "/space-bee-shooter/",
    missionSelectors: ["#missionLabel", "#missionProgress", "#storyTitle"],
    joystick: true,
    minMobileActions: 6,
    staticCheck: checkSpaceBeeShake,
  },
  {
    name: "neon-snake-arena",
    path: "/neon-snake-arena/",
    missionSelectors: ["#missionTitle", "#missionText"],
    joystick: true,
    minMobileActions: 4,
  },
  {
    name: "neon-pong-duel",
    path: "/neon-pong-duel/",
    missionSelectors: ["#playerStatus", "#playerText"],
    joystick: false,
    minMobileActions: 4,
  },
  {
    name: "starlight-runner",
    path: "/starlight-runner/",
    missionSelectors: ["#missionTitle", "#missionText"],
    joystick: true,
    minMobileActions: 3,
  },
];

const HUBS = [
  {
    name: "game-collection",
    path: "/game-collection/",
  },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile-portrait", width: 390, height: 844, mobile: true },
  { name: "mobile-landscape", width: 844, height: 390, mobile: true },
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

async function main() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This QA script requires Node.js with global WebSocket support. Use Node 20+.");
  }

  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  for (const game of GAMES) {
    if (game.staticCheck) {
      const result = game.staticCheck();
      if (!result.pass) failures.push({ game: game.name, viewport: "static", reason: result.reason });
      printResult(result.pass, game.name, "static", result.reason);
    }
  }

  const server = options.baseUrl ? null : await startStaticServer(ROOT);
  const baseUrl = normalizeBaseUrl(options.baseUrl || server.url);
  const chrome = await startChrome();
  const client = await connectToBrowser(chrome.port);

  try {
    for (const game of GAMES) {
      for (const viewport of VIEWPORTS) {
        const result = await inspectGame(client, new URL(game.path, baseUrl).toString(), game, viewport);
        if (!result.pass) failures.push(result);
        printResult(result.pass, game.name, viewport.name, result.reason);
      }
    }
    for (const hub of HUBS) {
      for (const viewport of VIEWPORTS) {
        const result = await inspectHub(client, new URL(hub.path, baseUrl).toString(), hub, viewport);
        if (!result.pass) failures.push(result);
        printResult(result.pass, hub.name, viewport.name, result.reason);
      }
    }
  } finally {
    await client.close().catch(() => {});
    await stopProcess(chrome.process);
    if (server) await server.close();
    await removeDir(chrome.profileDir);
  }

  if (failures.length) {
    console.error("\nQA failed:");
    for (const failure of failures) {
      console.error(`- ${failure.game} ${failure.viewport}: ${failure.reason}`);
    }
    process.exit(1);
  }

  console.log("\nQA passed: all game and collection targets meet the automated layout, canvas, mission, mobile controls, fullscreen, and shake checks.");
}

function parseArgs(args) {
  const options = { baseUrl: process.env.QA_BASE_URL || "" };
  for (const arg of args) {
    if (arg.startsWith("--base-url=")) options.baseUrl = arg.slice("--base-url=".length);
    else if (arg === "--production") options.baseUrl = "https://arcade-game-hub.pages.dev/";
    else if (arg === "--help") {
      console.log("Usage: node scripts/qa-cdp.js [--base-url=https://example.com/] [--production]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

function printResult(pass, game, viewport, reason) {
  const status = pass ? "PASS" : "FAIL";
  console.log(`${status} ${game} ${viewport} - ${reason}`);
}

function checkSpaceBeeShake() {
  const file = path.join(ROOT, "space-bee-shooter", "game.js");
  const source = fs.readFileSync(file, "utf8");
  const drawBody = extractFunctionBody(source, "draw");
  if (!drawBody) return { pass: false, reason: "function draw() not found" };
  if (/ctx\s*\.\s*translate\s*\(/.test(drawBody)) {
    return { pass: false, reason: "draw() still translates the main canvas" };
  }
  if (/screenShake/.test(drawBody)) {
    return { pass: false, reason: "draw() still reads screenShake" };
  }
  if (/(Math\s*\.\s*random|rand\s*\()/.test(drawBody)) {
    return { pass: false, reason: "draw() still uses random movement" };
  }
  return { pass: true, reason: "main camera shake is absent from draw()" };
}

function extractFunctionBody(source, functionName) {
  const match = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  if (!match) return "";
  let depth = 1;
  let index = match.index + match[0].length;
  const start = index;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    index += 1;
  }
  return source.slice(start, index - 1);
}

async function startStaticServer(root) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    let filePath = decodeURIComponent(requestUrl.pathname);
    if (filePath.endsWith("/")) filePath += "index.html";
    const resolved = path.resolve(root, "." + filePath);
    if (!resolved.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(resolved, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME_TYPES[path.extname(resolved)] || "application/octet-stream" });
      res.end(data);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startChrome() {
  const executable = findChromeExecutable();
  if (!executable) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to the browser executable and rerun QA.");
  }

  const port = await freePort();
  const profileDir = path.join(ROOT, ".chrome-qa", `profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(executable, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: "ignore" });

  await waitForDebugger(port);
  return { process: chrome, port, profileDir };
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForDebugger(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error("Timed out waiting for Chrome DevTools Protocol.");
}

async function connectToBrowser(port) {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  return await CdpClient.connect(version.webSocketDebuggerUrl);
}

async function inspectGame(browser, url, game, viewport) {
  const errors = [];
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  const onMessage = (message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails?.text || "runtime exception");
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      errors.push(message.params.entry.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push("console.error");
    }
  };

  browser.onMessage.add(onMessage);
  try {
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Log.enable", {}, sessionId);
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    }, sessionId);

    await browser.send("Page.navigate", { url }, sessionId);
    await waitForPageLoad(browser, sessionId);
    await sleep(1000);

    const expression = pageInspectionExpression(game);
    const evaluation = await browser.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    const value = evaluation.result.value;
    const reason = validateInspection(value, errors);
    return { pass: !reason, game: game.name, viewport: viewport.name, reason: reason || "layout, canvas, mission text, and console checks passed" };
  } finally {
    browser.onMessage.delete(onMessage);
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => {});
  }
}

async function inspectHub(browser, url, hub, viewport) {
  const errors = [];
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const attached = await browser.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;

  const onMessage = (message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails?.text || "runtime exception");
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      errors.push(message.params.entry.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push("console.error");
    }
  };

  browser.onMessage.add(onMessage);
  try {
    await browser.send("Runtime.enable", {}, sessionId);
    await browser.send("Log.enable", {}, sessionId);
    await browser.send("Page.enable", {}, sessionId);
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    }, sessionId);

    await browser.send("Page.navigate", { url }, sessionId);
    await waitForPageLoad(browser, sessionId);
    await sleep(1000);

    const evaluation = await browser.send("Runtime.evaluate", {
      expression: hubInspectionExpression(),
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    const value = evaluation.result.value;
    const reason = validateHubInspection(value, errors);
    return { pass: !reason, game: hub.name, viewport: viewport.name, reason: reason || "hub layout, cards, actions, and mobile mode checks passed" };
  } finally {
    browser.onMessage.delete(onMessage);
    await browser.send("Target.closeTarget", { targetId: target.targetId }).catch(() => {});
  }
}

function pageInspectionExpression(game) {
  return `(async () => {
    const stage = document.querySelector(".stage-wrap");
    const canvas = document.querySelector("canvas");
    const fullscreenButton = document.querySelector("#fullscreenButton");
    const mobileLayer = document.querySelector(".mobile-control-layer");
    const joystick = document.querySelector("#moveStick");
    const mobileActions = [...document.querySelectorAll(".mobile-action-pad button")];
    const doc = document.documentElement;
    const body = document.body;
    const stageRect = stage ? stage.getBoundingClientRect() : null;
    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
    const missionSelectors = ${JSON.stringify(game.missionSelectors)};
    const missionText = missionSelectors
      .map((selector) => document.querySelector(selector)?.textContent?.trim() || "")
      .filter(Boolean)
      .join(" ");
    const horizontalOverflow = Math.max(doc.scrollWidth, body.scrollWidth) > window.innerWidth + 2;
    let mobileControlProbe = false;
    if (window.innerWidth <= 560 && mobileLayer) {
      const target = joystick || mobileActions[0];
      if (target) {
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width * 0.7;
        const y = rect.top + rect.height * 0.5;
        target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 9, buttons: 1, clientX: x, clientY: y }));
        target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 9, buttons: 1, clientX: x + 8, clientY: y }));
        target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 9, buttons: 0, clientX: x + 8, clientY: y }));
        mobileControlProbe = true;
      }
      const action = mobileActions[0];
      if (action) {
        const rect = action.getBoundingClientRect();
        const x = rect.left + rect.width * 0.5;
        const y = rect.top + rect.height * 0.5;
        action.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 10, buttons: 1, clientX: x, clientY: y }));
        action.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 10, buttons: 0, clientX: x, clientY: y }));
        action.click();
      }
    }
    let fullscreenProbe = false;
    if (fullscreenButton) {
      fullscreenButton.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      fullscreenProbe = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains("app-fullscreen") || fullscreenButton.textContent.trim() === "EXIT");
      if (document.body.classList.contains("app-fullscreen")) {
        fullscreenButton.click();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    let canvasNonBlank = false;
    let canvasVariance = 0;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const xs = [0.1, 0.25, 0.5, 0.75, 0.9].map((ratio) => Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * ratio))));
      const ys = [0.1, 0.25, 0.5, 0.75, 0.9].map((ratio) => Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * ratio))));
      const colors = [];
      for (const y of ys) {
        for (const x of xs) {
          const data = ctx.getImageData(x, y, 1, 1).data;
          colors.push(data[0] + data[1] + data[2] + data[3]);
        }
      }
      const min = Math.min(...colors);
      const max = Math.max(...colors);
      canvasVariance = max - min;
      canvasNonBlank = max > 0 && canvasVariance > 12;
    }
    return {
      title: document.title,
      stageExists: Boolean(stage),
      canvasExists: Boolean(canvas),
      stageRatio: stageRect ? stageRect.width / stageRect.height : 0,
      canvasRatio: canvasRect ? canvasRect.width / canvasRect.height : 0,
      stageWidth: stageRect ? stageRect.width : 0,
      viewportWidth: window.innerWidth,
      horizontalOverflow,
      canvasNonBlank,
      canvasVariance,
      missionTextLength: missionText.length,
      fullscreenExists: Boolean(fullscreenButton),
      fullscreenProbe,
      mobileLayerDisplay: mobileLayer ? getComputedStyle(mobileLayer).display : "",
      joystickExists: Boolean(joystick),
      joystickDisplay: joystick ? getComputedStyle(joystick).display : "",
      mobileActionCount: mobileActions.length,
      mobileControlProbe,
      visibleMobileActionCount: mobileActions.filter((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).length,
      expectsJoystick: ${Boolean(game.joystick)},
      minMobileActions: ${game.minMobileActions || 0},
      isNarrow: window.innerWidth <= 560,
    };
  })()`;
}

function hubInspectionExpression() {
  return `(() => {
    const doc = document.documentElement;
    const body = document.body;
    const shell = document.querySelector(".hub-shell");
    const player = document.querySelector(".player-panel");
    const frame = document.querySelector(".frame-wrap");
    const iframe = document.querySelector("#gameFrame");
    const openButton = document.querySelector("#openButton");
    const cards = [...document.querySelectorAll(".game-card:not(.empty)")];
    const firstCard = cards[0];
    const shellRect = shell ? shell.getBoundingClientRect() : null;
    const firstCardRect = firstCard ? firstCard.getBoundingClientRect() : null;
    const horizontalOverflow = Math.max(doc.scrollWidth, body.scrollWidth) > window.innerWidth + 2;
    return {
      shellExists: Boolean(shell),
      playerExists: Boolean(player),
      openButtonExists: Boolean(openButton),
      gameCardCount: cards.length,
      horizontalOverflow,
      shellWidth: shellRect ? shellRect.width : 0,
      viewportWidth: window.innerWidth,
      frameDisplay: frame ? getComputedStyle(frame).display : "",
      iframeAllowsFullscreen: iframe ? (iframe.hasAttribute("allowfullscreen") && (iframe.getAttribute("allow") || "").includes("fullscreen")) : false,
      firstCardHeight: firstCardRect ? firstCardRect.height : 0,
      isNarrow: window.innerWidth <= 560,
    };
  })()`;
}

function validateInspection(value, errors) {
  if (errors.length) return `console/runtime errors: ${errors.slice(0, 3).join("; ")}`;
  if (!value.stageExists) return ".stage-wrap not found";
  if (!value.canvasExists) return "canvas not found";
  if (Math.abs(value.stageRatio - 16 / 9) > 0.025) return `stage ratio ${value.stageRatio.toFixed(4)} is not 16:9`;
  if (Math.abs(value.canvasRatio - 16 / 9) > 0.035) return `canvas ratio ${value.canvasRatio.toFixed(4)} is not 16:9`;
  if (value.stageWidth > value.viewportWidth + 2) return `stage width ${value.stageWidth}px exceeds viewport ${value.viewportWidth}px`;
  if (value.horizontalOverflow) return "horizontal overflow detected";
  if (!value.canvasNonBlank) return `canvas appears blank or too flat, variance ${value.canvasVariance}`;
  if (value.missionTextLength < 2) return "mission/status text not found";
  if (!value.fullscreenExists) return "fullscreen button not found";
  if (!value.fullscreenProbe) return "fullscreen button did not enter native or fallback fullscreen";
  if (value.isNarrow) {
    if (value.mobileLayerDisplay === "none") return "mobile control layer is hidden on narrow screens";
    if (value.expectsJoystick && !value.joystickExists) return "mobile joystick not found";
    if (value.expectsJoystick && value.joystickDisplay === "none") return "mobile joystick is hidden";
    if (value.visibleMobileActionCount < value.minMobileActions) return `expected ${value.minMobileActions} visible mobile actions, found ${value.visibleMobileActionCount}`;
    if (!value.mobileControlProbe) return "mobile control event probe did not run";
  }
  return "";
}

function validateHubInspection(value, errors) {
  if (errors.length) return `console/runtime errors: ${errors.slice(0, 3).join("; ")}`;
  if (!value.shellExists) return ".hub-shell not found";
  if (!value.playerExists) return ".player-panel not found";
  if (!value.openButtonExists) return "open game action not found";
  if (!value.iframeAllowsFullscreen) return "hub iframe does not allow fullscreen";
  if (value.gameCardCount < 4) return `expected at least 4 playable cards, found ${value.gameCardCount}`;
  if (value.shellWidth > value.viewportWidth + 2) return `hub width ${value.shellWidth}px exceeds viewport ${value.viewportWidth}px`;
  if (value.horizontalOverflow) return "horizontal overflow detected";
  if (value.isNarrow && value.frameDisplay !== "none") return "mobile hub still shows embedded iframe";
  if (value.isNarrow && value.firstCardHeight > 130) return `mobile cards are too tall (${value.firstCardHeight}px)`;
  return "";
}

async function waitForPageLoad(client, sessionId) {
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    const listener = (message) => {
      if (message.sessionId === sessionId && message.method === "Page.loadEventFired") {
        clearTimeout(timeout);
        client.onMessage.delete(listener);
        resolve();
      }
    };
    client.onMessage.add(listener);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return await response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(child) {
  if (!child.killed) child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2500),
  ]);
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(250);
    }
  }
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.onMessage = new Set();
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    const client = new CdpClient(socket);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => client.handleMessage(event));
    socket.addEventListener("close", () => {
      for (const { reject } of client.pending.values()) reject(new Error("CDP socket closed"));
      client.pending.clear();
    });
    return client;
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    for (const listener of this.onMessage) listener(message);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 10000);
    });
  }

  close() {
    this.socket.close();
    return Promise.resolve();
  }
}
