let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let eyeOpen = false;
let awakened = false;
let detectionActive = false;
let gestureCount = 0;
let backendConnected = false;
let ws = null;

// Debug mode - shows messages in browser
const DEBUG = true;
function debugLog(msg) {
  if (DEBUG) {
    console.log("[NETRAX DEBUG]", msg);
    // Show in UI
    if (document.getElementById("debugPanel")) {
      document.getElementById("debugPanel").innerHTML += msg + "<br>";
      document.getElementById("debugPanel").scrollTop =
        document.getElementById("debugPanel").scrollHeight;
    }
  }
}

// Create debug panel
const debugPanel = document.createElement("div");
debugPanel.id = "debugPanel";
debugPanel.style.cssText = `
            position: fixed;
            bottom: 300px;
            right: 20px;
            width: 300px;
            height: 150px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #ff0000;
            color: #00ff00;
            font-family: monospace;
            font-size: 0.75em;
            padding: 10px;
            overflow-y: auto;
            z-index: 9999;
            border-radius: 5px;
        `;
document.body.appendChild(debugPanel);

debugLog("🚀 NETRAX AI - Vision System Initialized");
debugLog("📡 Attempting to connect to backend...");

// Custom cursor
document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursor.style.left = mouseX + "px";
  cursor.style.top = mouseY + "px";
});

// Generate threads
function generateThreads() {
  const container = document.getElementById("threadContainer");
  const numThreads = 25;

  for (let i = 0; i < numThreads; i++) {
    const thread = document.createElement("div");
    thread.className = "thread";
    thread.style.left = (i / numThreads) * 100 + "%";
    thread.style.animationDelay = i * 0.05 + "s";
    container.appendChild(thread);
  }

  setTimeout(() => {
    container.classList.add("hidden");
  }, 2500);
}

// Generate particles
function generateParticles() {
  const container = document.getElementById("particleContainer");
  for (let i = 0; i < 60; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = Math.random() * 100 + "%";
    particle.style.top = Math.random() * 100 + "%";
    particle.style.setProperty("--tx", (Math.random() - 0.5) * 300 + "px");
    particle.style.setProperty("--ty", (Math.random() - 0.5) * 300 + "px");
    particle.style.animationDelay = Math.random() * 15 + "s";
    container.appendChild(particle);
  }
}

// Eye tracking
function trackMouse() {
  if (!awakened) return;

  const eyeRect = mainEye.getBoundingClientRect();
  const eyeCenterX = eyeRect.left + eyeRect.width / 2;
  const eyeCenterY = eyeRect.top + eyeRect.height / 2;

  const deltaX = mouseX - eyeCenterX;
  const deltaY = mouseY - eyeCenterY;

  const angle = Math.atan2(deltaY, deltaX);
  const distance = Math.min(
    Math.sqrt(deltaX * deltaX + deltaY * deltaY) / 25,
    10
  );

  const moveX = Math.cos(angle) * distance;
  const moveY = Math.sin(angle) * distance;

  irisContainer.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;

  requestAnimationFrame(trackMouse);
}

// Open eye
mainEye.addEventListener("click", async function () {
  if (awakened) {
    // Close and exit
    closeVisionSystem();
    return;
  }

  if (eyeOpen) return;

  eyeOpen = true;
  document.getElementById("instruction").classList.add("hidden");

  mainEye.classList.add("open");

  await sleep(800);

  // Show UI panels
  document.getElementById("videoPanel").classList.add("visible");
  document.getElementById("statsPanel").classList.add("visible");
  document.getElementById("gesturesPanel").classList.add("visible");
  document.getElementById("closeIndicator").classList.add("visible");
});

// WebSocket connection
function connectWebSocket() {
  debugLog("🔗 Connecting to WebSocket...");

  ws = new WebSocket("ws://localhost:8000/ws");

  ws.onopen = () => {
    debugLog("✅ WebSocket CONNECTED!");
    backendConnected = true;
    document.querySelector(".video-placeholder").innerHTML = `
                    <img id="videoFeed" src="http://localhost:8000/video_feed" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
                    <div style="position: absolute; top: 10px; left: 10px; background: rgba(255,0,0,0.8); 
                                color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; font-size: 0.75em;">
                        ● LIVE
                    </div>
                `;
    debugLog("📹 Video feed loaded");
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      debugLog(
        `📊 Stats: FPS=${data.stats?.fps || 0}, Gestures=${
          data.stats?.gesture_count || 0
        }`
      );

      if (data.type === "stats") {
        document.getElementById("fpsValue").textContent = Math.round(
          data.stats.fps || 0
        );
        document.getElementById("gestureCount").textContent =
          data.stats.gesture_count || 0;
        document.getElementById("accuracy").textContent =
          Math.round((data.stats.confidence || 0) * 100) + "%";
      } else if (data.type === "gesture_command") {
        debugLog(`🤚 Gesture detected: ${data.command}`);
        handleGestureCommand(data);
      }
    } catch (err) {
      debugLog(`❌ Parse error: ${err.message}`);
    }
  };

  ws.onerror = (error) => {
    debugLog(`❌ WebSocket ERROR: ${error}`);
    backendConnected = false;
  };

  ws.onclose = () => {
    debugLog("⚠️ WebSocket DISCONNECTED");
    backendConnected = false;
    if (detectionActive) {
      debugLog("🔄 Reconnecting in 3s...");
      setTimeout(connectWebSocket, 3000);
    }
  };
}

// Handle gesture commands
function handleGestureCommand(data) {
  const gestureMap = {
    peace: 0,
    screenshot: 0,
    stop: 1,
    pause_media: 1,
    thumbs_up: 2,
    volume_up: 2,
    thumbs_down: 3,
    volume_down: 3,
    fist: 4,
    mute: 4,
    point: 5,
    select: 5,
    swipe_left: 6,
    swipe_right: 6,
    next_track: 6,
    previous_track: 6,
    arms_crossed: 7,
    arms_up: 7,
    pause_detection: 7,
  };

  const command = data.command.toLowerCase();
  const gestureIndex = gestureMap[command];

  if (gestureIndex !== undefined) {
    const gestures = document.querySelectorAll(".gesture-box");
    const gesture = gestures[gestureIndex];
    if (gesture) {
      gesture.classList.add("active");
      setTimeout(() => gesture.classList.remove("active"), 600);
    }
  }
}

// Start detection
document
  .getElementById("startDetectionBtn")
  .addEventListener("click", async function () {
    if (detectionActive) return;
    detectionActive = true;

    debugLog("🎬 Starting detection...");
    this.textContent = "INITIALIZING...";
    this.style.pointerEvents = "none";

    await sleep(500);

    // Close eye
    mainEye.classList.remove("open");

    await sleep(3000);

    // Awaken with red glow
    mainEye.classList.add("open", "awakened");
    awakened = true;

    debugLog("👁️ Eye awakened");

    // Connect to backend WebSocket
    connectWebSocket();

    await sleep(2000);

    // Spawn small eyes
    spawnSmallEyes();

    await sleep(500);

    // Start tracking
    trackMouse();
    trackSmallEyes();

    debugLog("👀 Small eyes spawned");

    document.getElementById("eyesActive").textContent = "100";
  });

// Spawn 100 small eyes
function spawnSmallEyes() {
  const container = document.getElementById("smallEyesContainer");
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  for (let i = 0; i < 100; i++) {
    const eye = document.createElement("div");
    eye.className = "small-eye";

    const angle = Math.random() * Math.PI * 2;
    const distance =
      150 +
      Math.random() *
        (Math.min(window.innerWidth, window.innerHeight) / 2 - 150);

    const x = centerX + Math.cos(angle) * distance - 27.5;
    const y = centerY + Math.sin(angle) * distance - 16;

    eye.style.left = x + "px";
    eye.style.top = y + "px";
    eye.style.animationDelay = i * 0.02 + "s";

    eye.innerHTML = `
                    <div class="iris-container">
                        <div class="iris">
                            <div class="pupil">
                                <div class="reflection"></div>
                            </div>
                        </div>
                    </div>
                `;

    container.appendChild(eye);

    setTimeout(() => {
      eye.classList.add("visible");
    }, i * 15);
  }
}

// Track small eyes randomly
function trackSmallEyes() {
  if (!awakened) return;

  const eyes = document.querySelectorAll(".small-eye .iris-container");

  eyes.forEach((irisContainer, index) => {
    const randomX = (Math.random() - 0.5) * 6;
    const randomY = (Math.random() - 0.5) * 4;

    irisContainer.style.transform = `translate(calc(-50% + ${randomX}px), calc(-50% + ${randomY}px))`;
  });

  setTimeout(trackSmallEyes, 1000 + Math.random() * 2000);
}

// Simulate detection
function simulateDetection() {
  if (!detectionActive) return;

  // Only simulate if WebSocket not connected
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    document.getElementById("fpsValue").textContent = Math.floor(
      26 + Math.random() * 6
    );
    document.getElementById("accuracy").textContent =
      Math.floor(90 + Math.random() * 10) + "%";

    if (Math.random() > 0.94) {
      const gestures = document.querySelectorAll(".gesture-box");
      const randomGesture =
        gestures[Math.floor(Math.random() * gestures.length)];
      randomGesture.classList.add("active");
      gestureCount++;
      document.getElementById("gestureCount").textContent = gestureCount;
      setTimeout(() => randomGesture.classList.remove("active"), 600);
    }

    setTimeout(simulateDetection, 100);
  }
}

// Close vision system
async function closeVisionSystem() {
  detectionActive = false;

  mainEye.classList.add("closing");

  await sleep(800);

  // Recreate threads for closing
  const threadContainer = document.getElementById("threadContainer");
  threadContainer.innerHTML = "";
  threadContainer.classList.remove("hidden");
  threadContainer.style.animation = "none";
  threadContainer.style.opacity = "1";

  generateThreads();

  await sleep(2000);

  window.location.reload();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Initialize
generateThreads();
generateParticles();
