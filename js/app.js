// 1. Инициализация Three.js сцены и камеры
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// 2. Освещение и окружение
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 100, 50);
scene.add(light);
scene.add(new THREE.AmbientLight(0x555555));

// Отрисовка земли (сетка)
const grid = new THREE.GridHelper(200, 50, 0x004400, 0x228b22);
grid.position.y = 0;
scene.add(grid);

// Отрисовка трассы из FPV-ворот
function createGate(x, z, rotation) {
  const group = new THREE.Group();
  const geom = new THREE.TorusGeometry(2.5, 0.15, 8, 24);
  const mat = new THREE.MeshLambertMaterial({ color: 0xff3300 });
  const gate = new THREE.Mesh(geom, mat);
  gate.position.y = 2.5;
  group.add(gate);
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  scene.add(group);
}

for (let i = 0; i < 8; i++) {
  createGate(Math.sin(i) * 30, -i * 20 - 10, i * 0.3);
}

// 3. Параметры физической модели квадрокоптера
const drone = {
  pos: new THREE.Vector3(0, 1, 0),
  vel: new THREE.Vector3(),
  rot: new THREE.Euler(0, 0, 0, 'YXZ'),
  throttle: 0,
  mass: 0.5,
  gravity: 9.81,
  drag: 0.02
};

// Обработка клавиатуры
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Адаптация под размер экрана
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Элементы OSD
const elThrottle = document.getElementById('val-throttle');
const elAlt = document.getElementById('val-alt');
const elSpeed = document.getElementById('val-speed');
const elPitch = document.getElementById('val-pitch');
const elRoll = document.getElementById('val-roll');

// 4. Главный цикл симуляции
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Управление газом (W / S)
  if (keys['KeyW']) drone.throttle = Math.min(100, drone.throttle + 40 * dt);
  if (keys['KeyS']) drone.throttle = Math.max(0, drone.throttle - 40 * dt);

  // Сброс позиции (R)
  if (keys['KeyR']) {
    drone.pos.set(0, 1, 0);
    drone.vel.set(0, 0, 0);
    drone.rot.set(0, 0, 0);
    drone.throttle = 0;
  }

  // Управление ориентацией (Acro / Angle смеситель)
  const rotSpeed = 2.5;
  if (keys['ArrowUp']) drone.rot.x -= rotSpeed * dt;
  if (keys['ArrowDown']) drone.rot.x += rotSpeed * dt;
  if (keys['ArrowLeft']) drone.rot.z += rotSpeed * dt;
  if (keys['ArrowRight']) drone.rot.z -= rotSpeed * dt;
  if (keys['KeyA']) drone.rot.y += rotSpeed * dt;
  if (keys['KeyD']) drone.rot.y -= rotSpeed * dt;

  // Вектор тяги моторов
  const thrustMagnitude = (drone.throttle / 100) * (drone.gravity * 2.2);
  const thrustVector = new THREE.Vector3(0, 1, 0).applyEuler(drone.rot).multiplyScalar(thrustMagnitude);

  // Расчет физики (тяга, гравитация, сопротивление)
  drone.vel.y -= drone.gravity * dt;
  drone.vel.addScaledVector(thrustVector, dt);
  drone.vel.multiplyScalar(1 - drone.drag);
  drone.pos.addScaledVector(drone.vel, dt);

  // Столкновение с землей
  if (drone.pos.y < 0.3) {
    drone.pos.y = 0.3;
    drone.vel.set(0, 0, 0);
  }

  // Настройка курсовой FPV камеры (угол наклона 25°)
  camera.position.copy(drone.pos);
  camera.rotation.copy(drone.rot);
  camera.rotateX(25 * Math.PI / 180);

  // Обновление OSD телеметрии
  if (elThrottle) elThrottle.innerText = Math.round(drone.throttle);
  if (elAlt) elAlt.innerText = drone.pos.y.toFixed(1);
  if (elSpeed) elSpeed.innerText = drone.vel.length().toFixed(1);
  if (elPitch) elPitch.innerText = Math.round(-drone.rot.x * 180 / Math.PI);
  if (elRoll) elRoll.innerText = Math.round(drone.rot.z * 180 / Math.PI);

  renderer.render(scene, camera);
}

animate();
