/**
 * Ground Control Station (GCS) - Главный скрипт НСУ
 * Работает сразу при подключении внизу index.html
 */

// --- Состояние систем и Телеметрия ---
const state = {
  cameraMode: 'DAY',
  flightMode: 'AUTO (GCS CONTROL)',
  lat: 55.75124,
  lon: 37.61842,
  alt: 120,
  speed: 15.0,
  targetDist: 342,
  battery: 88,
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0.5,
  joystickLeft: { x: 0, y: 0 },
  joystickRight: { x: 0, y: 0 }
};

// --- Элементы UI ---
const elCamModeText = document.getElementById('cam-mode-text');
const elValMode = document.getElementById('val-mode');
const elLat = document.getElementById('drone-lat');
const elLon = document.getElementById('drone-lon');
const elAlt = document.getElementById('drone-alt');
const elSpeed = document.getElementById('drone-speed');
const elTargetDist = document.getElementById('target-dist');
const elBat = document.getElementById('val-bat');
const btnMode = document.getElementById('btn-mode');
const btnRtl = document.getElementById('btn-rtl');

// ==========================================
// 1. THREE.JS 3D-СИМУЛЯЦИЯ ВИДЕОПОТОКА КАМЕРЫ
// ==========================================
const cameraCanvas = document.getElementById('camera-canvas');
const container = document.getElementById('video-feed-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a101d);
scene.fog = new THREE.FogExp2(0x0a101d, 0.003);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
camera.position.set(0, 100, 200);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: cameraCanvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 300, 100);
scene.add(dirLight);

// Тактическая сетка поверхности
const gridHelper = new THREE.GridHelper(1000, 50, 0x00e5ff, 0x1f2d3d);
gridHelper.position.y = -1;
scene.add(gridHelper);

// Трехмерный объект цели (Маркер)
const targetGeometry = new THREE.BoxGeometry(12, 12, 12);
const dayMaterial = new THREE.MeshPhongMaterial({ color: 0xff3333 });
const irMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });
const targetMesh = new THREE.Mesh(targetGeometry, dayMaterial);
targetMesh.position.set(0, 6, 0);
scene.add(targetMesh);

// Объекты ландшафта
for (let i = 0; i < 20; i++) {
  const boxGeo = new THREE.BoxGeometry(15 + Math.random() * 20, 10 + Math.random() * 30, 15 + Math.random() * 20);
  const boxMat = new THREE.MeshPhongMaterial({ color: 0x1a2d42 });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.set((Math.random() - 0.5) * 800, boxGeo.parameters.height / 2, (Math.random() - 0.5) * 800);
  scene.add(box);
}

// Адаптация под размер окна
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  resizePfdCanvas();
  resizeMapCanvas();
});

// ==========================================
// 2. АВИАГОРИЗОНТ (PRIMARY FLIGHT DISPLAY)
// ==========================================
const pfdCanvas = document.getElementById('pfd-canvas');
const pfdCtx = pfdCanvas.getContext('2d');

function resizePfdCanvas() {
  if (!pfdCanvas) return;
  pfdCanvas.width = pfdCanvas.clientWidth || 300;
  pfdCanvas.height = pfdCanvas.clientHeight || 180;
}
resizePfdCanvas();

function drawPFD() {
  const w = pfdCanvas.width;
  const h = pfdCanvas.height;
  const cx = w / 2;
  const cy = h / 2;

  pfdCtx.clearRect(0, 0, w, h);

  pfdCtx.save();
  pfdCtx.translate(cx, cy);
  pfdCtx.rotate((state.roll * Math.PI) / 180);

  const pitchOffset = state.pitch * 3;

  // Небо и Земля
  pfdCtx.fillStyle = '#0f2b46';
  pfdCtx.fillRect(-w, -h * 2 + pitchOffset, w * 2, h * 2);

  pfdCtx.fillStyle = '#3a2512';
  pfdCtx.fillRect(-w, pitchOffset, w * 2, h * 2);

  // Горизонт
  pfdCtx.strokeStyle = '#00ff66';
  pfdCtx.lineWidth = 2;
  pfdCtx.beginPath();
  pfdCtx.moveTo(-w, pitchOffset);
  pfdCtx.lineTo(w, pitchOffset);
  pfdCtx.stroke();

  pfdCtx.restore();

  // Символ ЛА
  pfdCtx.strokeStyle = '#00e5ff';
  pfdCtx.lineWidth = 3;
  pfdCtx.beginPath();
  pfdCtx.moveTo(cx - 30, cy);
  pfdCtx.lineTo(cx - 10, cy);
  pfdCtx.lineTo(cx, cy + 8);
  pfdCtx.lineTo(cx + 10, cy);
  pfdCtx.lineTo(cx + 30, cy);
  pfdCtx.stroke();
}

// ==========================================
// 3. ТАКТИЧЕСКАЯ КАРТА (2D CANVAS)
// ==========================================
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas.getContext('2d');

function resizeMapCanvas() {
  if (!mapCanvas) return;
  mapCanvas.width = mapCanvas.clientWidth || 300;
  mapCanvas.height = mapCanvas.clientHeight || 180;
}
resizeMapCanvas();

function drawMap() {
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;

  mapCtx.clearRect(0, 0, w, h);

  // Сетка радара
  mapCtx.strokeStyle = '#1e293b';
  mapCtx.lineWidth = 1;
  for (let r = 25; r < Math.max(w, h); r += 30) {
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // Оси
  mapCtx.strokeStyle = '#1a2433';
  mapCtx.beginPath();
  mapCtx.moveTo(cx, 0); mapCtx.lineTo(cx, h);
  mapCtx.moveTo(0, cy); mapCtx.lineTo(w, cy);
  mapCtx.stroke();

  // Иконка БПЛА в центре
  mapCtx.save();
  mapCtx.translate(cx, cy);
  mapCtx.rotate((state.yaw * Math.PI) / 180);
  mapCtx.fillStyle = '#00ff66';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -8);
  mapCtx.lineTo(6, 8);
  mapCtx.lineTo(-6, 8);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// ==========================================
// 4. ЛОГИКА ВИРТУАЛЬНЫХ СТИКОВ
// ==========================================
function setupJoystick(containerId, callback) {
  const base = document.getElementById(containerId);
  if (!base) return;
  const thumb = base.querySelector('.joystick-thumb');
  let active = false;
  const maxRadius = 35;

  function move(clientX, clientY) {
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    callback(dx / maxRadius, dy / maxRadius);
  }

  function end() {
    if (!active) return;
    active = false;
    thumb.style.transform = 'translate(0px, 0px)';
    callback(0, 0);
  }

  base.addEventListener('mousedown', (e) => { active = true; move(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => { if (active) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', end);

  base.addEventListener('touchstart', (e) => { active = true; move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('touchmove', (e) => { if (active) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('touchend', end);
}

setupJoystick('joy-left', (x, y) => { state.joystickLeft.x = x; state.joystickLeft.y = y; });
setupJoystick('joy-right', (x, y) => { state.joystickRight.x = x; state.joystickRight.y = y; });

// Кнопки
if (btnMode) {
  btnMode.addEventListener('click', () => {
    state.cameraMode = state.cameraMode === 'DAY' ? 'IR' : 'DAY';
    if (elCamModeText) elCamModeText.innerText = state.cameraMode === 'DAY' ? 'DAY (OPTICAL)' : 'NIGHT / IR (THERMAL)';
    scene.background = new THREE.Color(state.cameraMode === 'DAY' ? 0x0a101d : 0x021108);
    scene.fog.color = scene.background;
    targetMesh.material = state.cameraMode === 'DAY' ? dayMaterial : irMaterial;
  });
}

if (btnRtl) {
  btnRtl.addEventListener('click', () => {
    state.flightMode = 'RTL (RETURNING HOME)';
    if (elValMode) {
      elValMode.innerText = state.flightMode;
      elValMode.style.color = '#ff3333';
    }
  });
}

// ==========================================
// 5. ГЛАВНЫЙ АНИМАЦИОННЫЙ ЦИКЛ
// ==========================================
function animate() {
  requestAnimationFrame(animate);

  // Физика от стиков
  state.roll = state.joystickRight.x * 25;
  state.pitch = -state.joystickRight.y * 20;
  state.yaw += state.joystickLeft.x * 1.5;
  state.alt = Math.max(10, Math.min(500, state.alt - state.joystickLeft.y * 0.5));

  // Вращение цели и камеры
  targetMesh.rotation.y += 0.01;
  camera.position.x = Math.sin(Date.now() * 0.0005) * 60;
  camera.lookAt(targetMesh.position);

  // Рендер сцен
  renderer.render(scene, camera);
  drawPFD();
  drawMap();

  // Телеметрия
  if (elAlt) elAlt.innerText = state.alt.toFixed(1);
  if (elSpeed) elSpeed.innerText = state.speed.toFixed(1);
  if (elTargetDist) elTargetDist.innerText = (340 + Math.sin(Date.now() * 0.001) * 10).toFixed(0);
}

// Запуск приложения
animate();
