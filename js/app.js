/**
 * Ground Control Station (GCS) - Симуляция полёта БПЛА
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
  posX: 0,
  posZ: 0,
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
// 1. THREE.JS 3D-СИМУЛЯЦИЯ ПОЛЁТА
// ==========================================
const cameraCanvas = document.getElementById('camera-canvas');
const container = document.getElementById('video-feed-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a101d);
scene.fog = new THREE.FogExp2(0x0a101d, 0.002);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 3000);
camera.position.set(0, 15, 0);

const renderer = new THREE.WebGLRenderer({ canvas: cameraCanvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 300, 100);
scene.add(dirLight);

// Бесконечная сетка поверхности
const gridGroup = new THREE.Group();
const gridHelper = new THREE.GridHelper(2000, 100, 0x00e5ff, 0x1f2d3d);
gridGroup.add(gridHelper);
scene.add(gridGroup);

// Массив наземных объектов (домов/ориентиров)
const terrainObjects = [];
for (let i = 0; i < 40; i++) {
  const boxGeo = new THREE.BoxGeometry(15 + Math.random() * 25, 20 + Math.random() * 40, 15 + Math.random() * 25);
  const boxMat = new THREE.MeshPhongMaterial({ color: 0x1a2d42 });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.set((Math.random() - 0.5) * 1500, boxGeo.parameters.height / 2, (Math.random() - 0.5) * 1500);
  scene.add(box);
  terrainObjects.push(box);
}

// Цель (Красный куб)
const targetGeometry = new THREE.BoxGeometry(15, 15, 15);
const dayMaterial = new THREE.MeshPhongMaterial({ color: 0xff3333 });
const irMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });
const targetMesh = new THREE.Mesh(targetGeometry, dayMaterial);
targetMesh.position.set(0, 7.5, -400);
scene.add(targetMesh);

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
// 2. АВИАГОРИЗОНТ (PFD)
// ==========================================
const pfdCanvas = document.getElementById('pfd-canvas');
const pfdCtx = pfdCanvas ? pfdCanvas.getContext('2d') : null;

function resizePfdCanvas() {
  if (!pfdCanvas) return;
  pfdCanvas.width = pfdCanvas.clientWidth || 300;
  pfdCanvas.height = pfdCanvas.clientHeight || 180;
}
resizePfdCanvas();

function drawPFD() {
  if (!pfdCtx) return;
  const w = pfdCanvas.width;
  const h = pfdCanvas.height;
  const cx = w / 2;
  const cy = h / 2;

  pfdCtx.clearRect(0, 0, w, h);

  pfdCtx.save();
  pfdCtx.translate(cx, cy);
  pfdCtx.rotate((state.roll * Math.PI) / 180);

  const pitchOffset = state.pitch * 2.5;

  pfdCtx.fillStyle = '#0f2b46';
  pfdCtx.fillRect(-w, -h * 2 + pitchOffset, w * 2, h * 2);

  pfdCtx.fillStyle = '#3a2512';
  pfdCtx.fillRect(-w, pitchOffset, w * 2, h * 2);

  pfdCtx.strokeStyle = '#00ff66';
  pfdCtx.lineWidth = 2;
  pfdCtx.beginPath();
  pfdCtx.moveTo(-w, pitchOffset);
  pfdCtx.lineTo(w, pitchOffset);
  pfdCtx.stroke();

  pfdCtx.restore();

  // Иконка центра
  pfdCtx.strokeStyle = '#00e5ff';
  pfdCtx.lineWidth = 3;
  pfdCtx.beginPath();
  pfdCtx.moveTo(cx - 25, cy);
  pfdCtx.lineTo(cx - 10, cy);
  pfdCtx.lineTo(cx, cy + 6);
  pfdCtx.lineTo(cx + 10, cy);
  pfdCtx.lineTo(cx + 25, cy);
  pfdCtx.stroke();
}

// ==========================================
// 3. ТАКТИЧЕСКАЯ КАРТА
// ==========================================
const mapCanvas = document.getElementById('map-canvas');
const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;
const mapTrail = [];

function resizeMapCanvas() {
  if (!mapCanvas) return;
  mapCanvas.width = mapCanvas.clientWidth || 300;
  mapCanvas.height = mapCanvas.clientHeight || 180;
}
resizeMapCanvas();

function drawMap() {
  if (!mapCtx) return;
  const w = mapCanvas.width;
  const h = mapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;

  mapCtx.clearRect(0, 0, w, h);

  // Сетка
  mapCtx.strokeStyle = '#1e293b';
  mapCtx.lineWidth = 1;
  for (let r = 25; r < Math.max(w, h); r += 30) {
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // Траектория полёта
  if (mapTrail.length > 1) {
    mapCtx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(cx + mapTrail[0].x, cy + mapTrail[0].y);
    for (let i = 1; i < mapTrail.length; i++) {
      mapCtx.lineTo(cx + mapTrail[i].x, cy + mapTrail[i].y);
    }
    mapCtx.stroke();
  }

  // Метка БПЛА
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
// 4. УПРАВЛЕНИЕ СТИКАМИ
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
// 5. ФИЗИКА И ДИНАМИКА ПОЛЁТА
// ==========================================
function animate() {
  requestAnimationFrame(animate);

  // Управление с правого стика (Крен и Тангаж)
  state.roll = state.joystickRight.x * 30;
  state.pitch = -state.joystickRight.y * 25;

  // Управление с левого стика (Рыскание и Высота)
  state.yaw += state.joystickLeft.x * 1.8;
  state.alt = Math.max(10, Math.min(800, state.alt - state.joystickLeft.y * 0.8));

  // Динамический расчёт скорости на основе наклона вперёд (pitch)
  state.speed = Math.max(0, Math.min(45, 18.0 - state.pitch * 0.6));

  // Вектор движения
  const radYaw = (state.yaw * Math.PI) / 180;
  const moveStep = state.speed * 0.08;

  state.posX += Math.sin(radYaw) * moveStep;
  state.posZ -= Math.cos(radYaw) * moveStep;

  // Обновление GPS-координат
  state.lat += Math.cos(radYaw) * state.speed * 0.0000005;
  state.lon += Math.sin(radYaw) * state.speed * 0.0000005;

  // Движение ландшафта под камерой
  gridGroup.position.x = -state.posX % 40;
  gridGroup.position.z = -state.posZ % 40;

  terrainObjects.forEach((obj, idx) => {
    const relX = (obj.position.x - state.posX) % 1200;
    const relZ = (obj.position.z - state.posZ) % 1200;
  });

  // Наклон 3D-камеры при полёте
  camera.rotation.y = -radYaw;
  camera.rotation.x = (state.pitch * Math.PI) / 180 * 0.2;
  camera.rotation.z = -(state.roll * Math.PI) / 180 * 0.3;

  // Запись точки на карте
  if (Math.random() < 0.15) {
    mapTrail.push({
      x: -Math.sin(radYaw) * (mapTrail.length * 1.5),
      y: Math.cos(radYaw) * (mapTrail.length * 1.5)
    });
    if (mapTrail.length > 40) mapTrail.shift();
  }

  // Отрисовка
  renderer.render(scene, camera);
  drawPFD();
  drawMap();

  // Обновление значений OSD
  if (elLat) elLat.innerText = state.lat.toFixed(5);
  if (elLon) elLon.innerText = state.lon.toFixed(5);
  if (elAlt) elAlt.innerText = state.alt.toFixed(1);
  if (elSpeed) elSpeed.innerText = state.speed.toFixed(1);
  if (elTargetDist) elTargetDist.innerText = Math.max(20, (340 - state.posZ * 0.1)).toFixed(0);
}

// Запуск
animate();
