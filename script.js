let FaceLandmarker = null;
let FilesetResolver = null;
let DrawingUtils = null;

const dom = {
  body: document.body,
  startBtn: document.getElementById("startBtn"),
  lockBtn: document.getElementById("lockBtn"),
  calibrateBtn: document.getElementById("calibrateBtn"),
  playBtn: document.getElementById("playBtn"),
  themeBtn: document.getElementById("themeBtn"),
  faceStatus: document.getElementById("faceStatus"),
  trackingStatus: document.getElementById("trackingStatus"),
  pitchStatus: document.getElementById("pitchStatus"),
  rollStatus: document.getElementById("rollStatus"),
  mouthStatus: document.getElementById("mouthStatus"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  cameraNote: document.getElementById("cameraNote"),
  player: document.getElementById("player"),
  gestureMeter: document.getElementById("gestureMeter")
};

const ctx = dom.overlay.getContext("2d");

let faceLandmarker = null;
let drawingUtils = null;
let stream = null;
let running = false;
let trackingLocked = true;

let neutralPitch = 0;
let neutralRoll = 0;

let lastThemeToggle = 0;
let lastMediaToggle = 0;

const smoothWindow = {
  pitch: [],
  roll: [],
  mouth: [],
  smile: []
};

async function getCameraPermissionState() {
  if (!navigator.permissions || !navigator.permissions.query) {
    return "unknown";
  }

  try {
    const status = await navigator.permissions.query({ name: "camera" });
    return status.state;
  } catch (_err) {
    return "unknown";
  }
}

async function requestCameraStream() {
  const tries = [
    {
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    },
    {
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 }
      },
      audio: false
    },
    {
      video: true,
      audio: false
    }
  ];

  let lastError = null;
  for (const constraints of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

function pushAndAverage(bucket, value, limit = 5) {
  bucket.push(value);
  if (bucket.length > limit) bucket.shift();
  const total = bucket.reduce((sum, n) => sum + n, 0);
  return total / bucket.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setChip(element, text, type) {
  element.textContent = text;
  element.classList.remove("ok", "warn");
  if (type) element.classList.add(type);
}

function resizeCanvasToVideo() {
  const width = dom.video.videoWidth;
  const height = dom.video.videoHeight;
  if (!width || !height) return;
  dom.overlay.width = width;
  dom.overlay.height = height;
}

function toggleTheme(forceDark = null) {
  const next = forceDark === null ? !dom.body.classList.contains("dark") : forceDark;
  dom.body.classList.toggle("dark", next);
}

function toggleMediaFromGesture() {
  const now = performance.now();
  if (now - lastMediaToggle < 1200) return;
  if (dom.player.paused) {
    dom.player.play().catch(() => {
      dom.cameraNote.textContent = "Audio play blocked by browser. Click Play once to allow gesture control.";
    });
  } else {
    dom.player.pause();
  }
  lastMediaToggle = now;
}

function processFaceResult(result) {
  if (!result.faceLandmarks.length) {
    setChip(dom.faceStatus, "Face: not found", "warn");
    ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
    return;
  }

  const landmarks = result.faceLandmarks[0];
  setChip(dom.faceStatus, "Face: detected", "ok");

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const chin = landmarks[152];
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];

  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  const faceVertical = Math.max(0.0001, chin.y - eyeCenterY);

  const rawPitch = (nose.y - eyeCenterY) / faceVertical;
  const rawRoll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const rawMouth = Math.max(0, (lowerLip.y - upperLip.y) / Math.max(0.0001, eyeDistance));

  let smile = 0;
  if (result.faceBlendshapes.length) {
    const blend = result.faceBlendshapes[0].categories;
    const leftSmile = blend.find((c) => c.categoryName === "mouthSmileLeft")?.score ?? 0;
    const rightSmile = blend.find((c) => c.categoryName === "mouthSmileRight")?.score ?? 0;
    smile = (leftSmile + rightSmile) / 2;
  }

  const pitch = pushAndAverage(smoothWindow.pitch, rawPitch);
  const roll = pushAndAverage(smoothWindow.roll, rawRoll);
  const mouth = pushAndAverage(smoothWindow.mouth, rawMouth);
  const smileSmooth = pushAndAverage(smoothWindow.smile, smile);

  const pitchDelta = pitch - neutralPitch;
  const rollDelta = roll - neutralRoll;
  const gestureStrength = Math.max(
    clamp((mouth - 0.15) * 4.2, 0, 1),
    clamp((smileSmooth - 0.45) * 3.3, 0, 1)
  );

  dom.gestureMeter.style.width = `${Math.round(gestureStrength * 100)}%`;
  dom.pitchStatus.textContent = `Pitch: ${pitchDelta.toFixed(3)}`;
  dom.rollStatus.textContent = `Roll: ${rollDelta.toFixed(3)}`;
  dom.mouthStatus.textContent = `Mouth/Smile: ${Math.max(mouth, smileSmooth).toFixed(2)}`;

  if (!trackingLocked) {
    const deadZone = 0.012;
    const speed = Math.abs(pitchDelta) > deadZone
      ? clamp((pitchDelta - Math.sign(pitchDelta) * deadZone) * 320, -14, 14)
      : 0;

    if (Math.abs(speed) > 0.2) {
      window.scrollBy(0, speed);
    }

    const now = performance.now();

    if ((mouth > 0.2 || smileSmooth > 0.62) && now - lastMediaToggle > 1200) {
      toggleMediaFromGesture();
    }

    if (Math.abs(rollDelta) > 0.28 && now - lastThemeToggle > 1500) {
      toggleTheme();
      lastThemeToggle = now;
    }
  }

  ctx.clearRect(0, 0, dom.overlay.width, dom.overlay.height);
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
    color: "#4cc9f0",
    lineWidth: 0.7
  });
  drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
    color: "#f48c06",
    lineWidth: 1.2
  });
}

async function predictLoop() {
  if (!running || !faceLandmarker) return;

  const nowInMs = performance.now();
  const result = faceLandmarker.detectForVideo(dom.video, nowInMs);
  processFaceResult(result);
  requestAnimationFrame(predictLoop);
}

async function startCamera() {
  if (running) return;

  dom.startBtn.disabled = true;
  dom.cameraNote.textContent = "Requesting camera permission. Please choose Allow in your browser prompt.";

  if (!window.isSecureContext) {
    dom.cameraNote.textContent = "Camera requires a secure context. Open this project on https:// or http://localhost.";
    setChip(dom.faceStatus, "Face: blocked", "warn");
    dom.startBtn.disabled = false;
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dom.cameraNote.textContent = "This browser does not support camera access via getUserMedia.";
    setChip(dom.faceStatus, "Face: unsupported", "warn");
    dom.startBtn.disabled = false;
    return;
  }

  try {
    const permissionState = await getCameraPermissionState();
    if (permissionState === "denied") {
      dom.cameraNote.textContent = "Camera permission is blocked in browser settings. Enable camera for this site, then retry.";
      setChip(dom.faceStatus, "Face: blocked", "warn");
      dom.startBtn.disabled = false;
      return;
    }

    // Ask for camera first so webcam preview starts even if tracking assets fail later.
    stream = await requestCameraStream();

    dom.video.srcObject = stream;
    await dom.video.play();
    resizeCanvasToVideo();
    setChip(dom.faceStatus, "Face: camera on", "ok");
    dom.cameraNote.textContent = "Camera active. Loading face tracker...";

    let trackerReady = false;

    try {
      if (!FaceLandmarker || !FilesetResolver || !DrawingUtils) {
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15");
        FaceLandmarker = vision.FaceLandmarker;
        FilesetResolver = vision.FilesetResolver;
        DrawingUtils = vision.DrawingUtils;
      }

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
      );

      async function createLandmarker(delegate) {
        return FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          numFaces: 1
        });
      }

      try {
        faceLandmarker = await createLandmarker("GPU");
      } catch (_gpuError) {
        faceLandmarker = await createLandmarker("CPU");
        dom.cameraNote.textContent = "GPU tracking unavailable. Running in CPU mode.";
      }

      drawingUtils = new DrawingUtils(ctx);
      trackerReady = true;
    } catch (trackerError) {
      console.error(trackerError);
      setChip(dom.trackingStatus, "Tracking: unavailable", "warn");
      dom.cameraNote.textContent = "Camera is on, but tracker failed to load. Check internet/CDN access and click Start Camera again.";
      dom.playBtn.disabled = false;
      dom.startBtn.disabled = false;
    }

    if (!trackerReady) {
      return;
    }

    running = true;
    trackingLocked = true;
    setChip(dom.trackingStatus, "Tracking: locked", "warn");
    setChip(dom.faceStatus, "Face: searching", "warn");
    dom.cameraNote.textContent = "Camera active. Unlock tracking and calibrate when your face is centered.";
    dom.lockBtn.disabled = false;
    dom.calibrateBtn.disabled = false;
    dom.playBtn.disabled = false;

    requestAnimationFrame(predictLoop);
  } catch (err) {
    console.error(err);
    if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
      dom.cameraNote.textContent = "Camera permission denied. Click Start Camera and allow access in the browser prompt.";
    } else if (err && err.name === "NotFoundError") {
      dom.cameraNote.textContent = "No webcam found. Connect a camera and try again.";
    } else if (err && err.name === "NotReadableError") {
      dom.cameraNote.textContent = "Camera is busy in another app. Close other apps using the webcam and retry.";
    } else if (err && err.name === "OverconstrainedError") {
      dom.cameraNote.textContent = "Camera constraints were not supported. Retried with safer settings, but failed.";
    } else {
      const details = err && err.name ? ` (${err.name})` : "";
      dom.cameraNote.textContent = `Could not start camera. Check permissions or browser support${details}.`;
    }
    setChip(dom.faceStatus, "Face: blocked", "warn");
    dom.startBtn.disabled = false;
  }
}

function calibrateNeutral() {
  if (!smoothWindow.pitch.length || !smoothWindow.roll.length) {
    dom.cameraNote.textContent = "No face data yet. Keep your face in frame and try calibration again.";
    return;
  }
  neutralPitch = smoothWindow.pitch[smoothWindow.pitch.length - 1];
  neutralRoll = smoothWindow.roll[smoothWindow.roll.length - 1];
  dom.cameraNote.textContent = "Calibrated. Neutral posture saved.";
}

dom.startBtn.addEventListener("click", startCamera);

dom.lockBtn.addEventListener("click", () => {
  trackingLocked = !trackingLocked;
  if (trackingLocked) {
    dom.lockBtn.textContent = "Unlock Tracking";
    setChip(dom.trackingStatus, "Tracking: locked", "warn");
  } else {
    dom.lockBtn.textContent = "Lock Tracking";
    setChip(dom.trackingStatus, "Tracking: live", "ok");
    dom.cameraNote.textContent = "Tracking unlocked. Gestures are active.";
  }
});

dom.calibrateBtn.addEventListener("click", calibrateNeutral);

dom.playBtn.addEventListener("click", () => {
  toggleMediaFromGesture();
});

dom.themeBtn.addEventListener("click", () => {
  toggleTheme();
});

window.addEventListener("resize", resizeCanvasToVideo);

window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
});
