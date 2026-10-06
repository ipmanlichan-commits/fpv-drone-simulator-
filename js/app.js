/**
 * Ground Control Station (GCS) - Прямой полет БПЛА от первого лица
 */

// --- Состояние систем и Телеметрия ---
const state = {
  cameraMode: 'DAY',
  flightMode: 'AUTO (GCS CONTROL)',
  lat: 55.75124,
  lon: 37.61842,
  alt: 120,          // Высота (м)
  speed: 25.0,       // Скорость полета (м/с)
  battery: 88,
  pitch: 0,          // Тангаж
  roll: 0,           // Крен
  yaw: 0,            // Курс
  posX: 0,           // Позиция в 3D
  posZ: 0,
  joystickLeft: { x: 0, y: 0 },
  joystickRight: { x: 0, y: 0 },
  keys: {}
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
scene.fog = new THREE.FogExp2(0x0a101d, 0.001);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);

const renderer = new THREE.WebGLRenderer({ canvas: cameraCanvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(200, 500, 200);
scene.add(dirLight);

// Бесконечная сетка поверхности
const gridHelper = new THREE.GridHelper(5000, 100, 0x00e5ff, 0x1f2d3d);
gridHelper.position.y = 0;
scene.add(gridHelper);

// Генерация 3D-ориентиров на местности
const buildings = [];
const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
const buildingMat = new THREE.MeshPhongMaterial({ color: 0x1a2d42 });

for (let i = 0; i < 100; i++) {
  const mesh = new THREE.Mesh(buildingGeo, buildingMat);
  const scaleX = 20 + Math.random() * 30;
  const scaleY = 20 + Math.random() * 60;
  const scaleZ = 20 + Math.random() * 30;
  mesh.scale.set(scaleX, scaleY, scaleZ);

  mesh.position.set(
    (Math.random() - 0.5) * 3000,
    scaleY / 2,
    (Math.random() - 0.5) * 3000
  );
  scene.add(mesh);
  buildings.push(mesh);
}

// Красный маркер цели впереди
const targetGeometry = new THREE.BoxGeometry(20, 20, 20);
const dayMaterial = new THREE.MeshPhongMaterial({ color: 0xff3333 });
const irMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });
const targetMesh = new THREE.Mesh(targetGeometry, dayMaterial);
targetMesh.position.set(0, 10, -800);
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

  // Перекрестие ЛА
  pfdCtx.strokeStyle = '#00e5ff';
  pfdCtx.lineWidth = 3;
  pfdCtx.beginPath();
  pfdCtx.moveTo(cx - 30, cy);
  pfdCtx.lineTo(cx - 10, cy);
  pfdCtx.lineTo(cx, cy + 6);
  pfdCtx.lineTo(cx + 10, cy);
  pfdCtx.lineTo(cx + 30, cy);
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

  // Кольца дальности
  mapCtx.strokeStyle = '#1e293b';
  mapCtx.lineWidth = 1;
  for (let r = 25; r < Math.max(w, h); r += 30) {
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // Траектория
  if (mapTrail.length > 1) {
    mapCtx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(cx + mapTrail[0].x, cy + mapTrail[0].y);
    for (let i = 1; i < mapTrail.length; i++) {
      mapCtx.lineTo(cx + mapTrail[i].x, cy + mapTrail[i].y);
    }
    mapCtx.stroke();
  }

  // Курсор дрона
  mapCtx.save();
  mapCtx.translate(cx, cy);
  mapCtx.rotate((state.yaw * Math.PI) / 180);
  mapCtx.fillStyle = '#00ff66';
  mapCtx.beginPath();
  mapCtx.moveTo(0, -9);
  mapCtx.lineTo(7, 9);
  mapCtx.lineTo(-7, 9);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

// ==========================================
// 4. УПРАВЛЕНИЕ (КЛАВИАТУРА И СТИКИ)
// ==========================================
window.addEventListener('keydown', (e) => { state.keys[e.code] = true; });
window.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

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
// 5. ДВИЖЕНИЕ В ВОРЛД-СПЕЙСЕ (ПОЛЕТ ВПЕРЕД)
// ==========================================
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Ввод со стиков и клавиатуры
  let inputRoll = state.joystickRight.x;
  let inputPitch = state.joystickRight.y;
  let inputYaw = state.joystickLeft.x;
  let inputAlt = state.joystickLeft.y;

  if (state.keys['KeyW'] || state.keys['ArrowUp']) inputPitch = -1;
  if (state.keys['KeyS'] || state.keys['ArrowDown']) inputPitch = 1;
  if (state.keys['KeyA'] || state.keys['ArrowLeft']) inputRoll = -1;
  if (state.keys['KeyD'] || state.keys['ArrowRight']) inputRoll = 1;
  if (state.keys['KeyQ']) inputYaw = -1;
  if (state.keys['KeyE']) inputYaw = 1;

  // Рассчет углов
  state.roll = inputRoll * 25;
  state.pitch = -inputPitch * 20;
  state.yaw += inputYaw * 45 * delta;

  // Расчет скорости и высоты
  state.alt = Math.max(10, Math.min(800, state.alt - inputAlt * 40 * delta));
  state.speed = Math.max(5, Math.min(70, 25.0 - state.pitch * 1.2));

  // ВЕКТОР ДВИЖЕНИЯ ВПЕРЕД (БЕЗ ВРАЩЕНИЯ ВОКРУГ ЦЕЛИ)
  const radYaw = (state.yaw * Math.PI) / 180;
  const moveDist = state.speed * delta * 12;

  state.posX += Math.sin(radYaw) * moveDist;
  state.posZ -= Math.cos(radYaw) * moveDist;

  // Установка позиции камеры дрона
  camera.position.x = state.posX;
  camera.position.z = state.posZ;
  camera.position.y = state.alt * 0.25;

  // Поворот камеры по курсу, тангажу и крен
  camera.rotation.order = 'YXZ';
  camera.rotation.y = -radYaw;
  camera.rotation.x = (state.pitch * Math.PI / 180) * 0.3;
  camera.rotation.z = -(state.roll * Math.PI / 180) * 0.4;

  // Закольцовка зданий вокруг летающего дрона
  buildings.forEach(b => {
    let dx = b.position.x - camera.position.x;
    let dz = b.position.z - camera.position.z;

    if (dz > 1500) b.position.z -= 3000;
    if (dz < -1500) b.position.z += 3000;
    if (dx > 1500) b.position.x -= 3000;
    if (dx < -1500) b.position.x += 3000;
  });

  // Закольцовка сетки земли
  gridHelper.position.x = Math.floor(camera.position.x / 50) * 50;
  gridHelper.position.z = Math.floor(camera.position.z / 50) * 50;

  // Вращение маркера цели
  targetMesh.rotation.y += delta;

  // Обновление GPS широты/долготы
  state.lat += Math.cos(radYaw) * state.speed * delta * 0.00001;
  state.lon += Math.sin(radYaw) * state.speed * delta * 0.00001;

  // Запись следа на карте
  if (Math.random() < 0.2) {
    mapTrail.push({
      x: (camera.position.x * 0.03) % 70,
      y: (camera.position.z * 0.03) % 70
    });
    if (mapTrail.length > 35) mapTrail.shift();
  }

  // Отрисовка
  renderer.render(scene, camera);
  drawPFD();
  drawMap();

  // Обновление OSD
  if (elLat) elLat.innerText = state.lat.toFixed(5);
  if (elLon) elLon.innerText = state.lon.toFixed(5);
  if (elAlt) elAlt.innerText = state.alt.toFixed(1);
  if (elSpeed) elSpeed.innerText = state.speed.toFixed(1);
  if (elTargetDist) elTargetDist.innerText = Math.max(5, Math.floor(camera.position.distanceTo(targetMesh.position))).toString();
}

// Запуск
animate();
