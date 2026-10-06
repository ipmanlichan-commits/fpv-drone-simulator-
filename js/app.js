/**
 * Ground Control Station (GCS) - Главный скрипт НСУ
 * Интеграция 3D-камеры Three.js, Тактической карты, Авиагоризонта (PFD) и Экранных стиков.
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- Состояние систем и Телеметрия ---
  const state = {
    cameraMode: 'DAY', // 'DAY' или 'IR'
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
  renderer.setPixelRatio(window.devicePixelRatio);

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
  const dayMaterial = new THREE.MeshPhongMaterial({ color: 0xff3333, wireframe: false });
  const irMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });
  const targetMesh = new THREE.Mesh(targetGeometry, dayMaterial);
  targetMesh.position.set(0, 6, 0);
  scene.add(targetMesh);

  // Объекты ландшафта
  for (let i = 0; i < 25; i++) {
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
  });

  // ==========================================
  // 2. АВИАГОРИЗОНТ (PRIMARY FLIGHT DISPLAY)
  // ==========================================
  const pfdCanvas = document.getElementById('pfd-canvas');
  const pfdCtx = pfdCanvas.getContext('2d');

  function resizePfdCanvas() {
    pfdCanvas.width = pfdCanvas.clientWidth;
    pfdCanvas.height = pfdCanvas.clientHeight;
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

    // Небо
    pfdCtx.fillStyle = '#0f2b46';
    pfdCtx.fillRect(-w, -h * 2 + pitchOffset, w * 2, h * 2);

    // Земля
    pfdCtx.fillStyle = '#3a2512';
    pfdCtx.fillRect(-w, pitchOffset, w * 2, h * 2);

    // Линия горизонта
    pfdCtx.strokeStyle = '#00ff66';
    pfdCtx.lineWidth = 2;
    pfdCtx.beginPath();
    pfdCtx.moveTo(-w, pitchOffset);
    pfdCtx.lineTo(w, pitchOffset);
    pfdCtx.stroke();

    // Шкала тангажа
    pfdCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    pfdCtx.fillStyle = '#ffffff';
    pfdCtx.font = '10px monospace';
    pfdCtx.textAlign = 'center';

    for (let deg = -30; deg <= 30; deg += 10) {
      if (deg === 0) continue;
      const y = pitchOffset - deg * 3;
      if (y > -cy + 10 && y < cy - 10) {
        pfdCtx.beginPath();
        pfdCtx.moveTo(-25, y);
        pfdCtx.lineTo(25, y);
        pfdCtx.stroke();
        pfdCtx.fillText(deg.toString(), 35, y + 3);
      }
    }

    pfdCtx.restore();

    // Символ летательного аппарата
    pfdCtx.strokeStyle = '#00e5ff';
    pfdCtx.lineWidth = 3;
    pfdCtx.beginPath();
    pfdCtx.moveTo(cx - 40, cy);
    pfdCtx.lineTo(cx - 15, cy);
    pfdCtx.lineTo(cx, cy + 10);
    pfdCtx.lineTo(cx + 15, cy);
    pfdCtx.lineTo(cx + 40, cy);
    pfdCtx.stroke();

    pfdCtx.fillStyle = '#00e5ff';
    pfdCtx.beginPath();
    pfdCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    pfdCtx.fill();
  }

  // ==========================================
  // 3. ТАКТИЧЕСКАЯ КАРТА (2D CANVAS)
  // ==========================================
  const mapCanvas = document.getElementById('map-canvas');
  const mapCtx = mapCanvas.getContext('2d');
  const trail = [];

  function resizeMapCanvas() {
    mapCanvas.width = mapCanvas.clientWidth;
    mapCanvas.height = mapCanvas.clientHeight;
  }
  resizeMapCanvas();

  function drawMap() {
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;

    mapCtx.clearRect(0, 0, w, h);

    // Круги радара
    mapCtx.strokeStyle = '#1e293b';
    mapCtx.lineWidth = 1;
    for (let r = 30; r < Math.max(w, h); r += 35) {
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, r, 0, Math.PI * 2);
      mapCtx.stroke();
    }

    // Оси сетки
    mapCtx.strokeStyle = '#1a2433';
    mapCtx.beginPath();
    mapCtx.moveTo(cx, 0); mapCtx.lineTo(cx, h);
    mapCtx.moveTo(0, cy); mapCtx.lineTo(w, cy);
    mapCtx.stroke();

    // Траектория полета
    if (trail.length > 1) {
      mapCtx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        mapCtx.lineTo(trail[i].x, trail[i].y);
      }
      mapCtx.stroke();
    }

    // Метка цели
    const targetX = cx + Math.sin(Date.now() * 0.001) * 20;
    const targetY = cy - 40;
    mapCtx.fillStyle = '#ff3333';
    mapCtx.beginPath();
    mapCtx.arc(targetX, targetY, 5, 0, Math.PI * 2);
    mapCtx.fill();

    // Иконка БПЛА (в центре)
    mapCtx.save();
    mapCtx.translate(cx, cy);
    mapCtx.rotate((state.yaw * Math.PI) / 180);

    mapCtx.fillStyle = '#00ff66';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -10);
    mapCtx.lineTo(8, 10);
    mapCtx.lineTo(0, 6);
    mapCtx.lineTo(-8, 10);
    mapCtx.closePath();
    mapCtx.fill();

    mapCtx.restore();

    // Запись точки маршрута
    if (Math.random() < 0.2) {
      trail.push({ x: cx + (Math.random() - 0.5) * 5, y: cy + (Math.random() - 0.5) * 5 });
      if (trail.length > 50) trail.shift();
    }
  }

  // ==========================================
  // 4. ЛОГИКА ВИРТУАЛЬНЫХ СТИКОВ
  // ==========================================
  function setupJoystick(containerId, callback) {
    const base = document.getElementById(containerId);
    if (!base) return;
    const thumb = base.querySelector('.joystick-thumb');
    let active = false;
    const maxRadius = 40;

    function handleStart(e) {
      active = true;
    }

    function handleMove(e) {
      if (!active) return;

      const rect = base.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

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

    function handleEnd() {
      if (!active) return;
      active = false;
      thumb.style.transform = 'translate(0px, 0px)';
      callback(0, 0);
    }

    base.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    base.addEventListener('touchstart', handleStart);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
  }

  setupJoystick('joy-left', (x, y) => {
    state.joystickLeft.x = x;
    state.joystickLeft.y = y;
  });

  setupJoystick('joy-right', (x, y) => {
    state.joystickRight.x = x;
    state.joystickRight.y = y;
  });

  // ==========================================
  // 5. ОБРАБОТКА КНОПОК И OSD
  // ==========================================
  btnMode.addEventListener('click', () => {
    if (state.cameraMode === 'DAY') {
      state.cameraMode = 'IR';
      elCamModeText.innerText = 'NIGHT / IR (THERMAL)';
      scene.background = new THREE.Color(0x021108);
      scene.fog.color = new THREE.Color(0x021108);
      targetMesh.material = irMaterial;
    } else {
      state.cameraMode = 'DAY';
      elCamModeText.innerText = 'DAY (OPTICAL)';
      scene.background = new THREE.Color(0x0a101d);
      scene.fog.color = new THREE.Color(0x0a101d);
      targetMesh.material = dayMaterial;
    }
  });

  btnRtl.addEventListener('click', () => {
    state.flightMode = 'RTL (RETURNING HOME)';
    elValMode.innerText = state.flightMode;
    elValMode.style.color = '#ff3333';
  });

  // ==========================================
  // 6. ОСНОВНОЙ ЦИКЛ ОБНОВЛЕНИЯ И ФИЗИКИ
  // ==========================================
  function animate() {
    requestAnimationFrame(animate);

    // Перевод ввода со стиков в пространственное положение
    state.roll = state.joystickRight.x * 25;
    state.pitch = -state.joystickRight.y * 20;
    state.yaw += state.joystickLeft.x * 1.5;

    // Симуляция высоты и скорости
    state.alt += -state.joystickLeft.y * 0.5;
    state.alt = Math.max(10, Math.min(500, state.alt));
    state.speed = 15.0 + state.pitch * 0.3;

    // Вращение объекта в 3D-камере
    targetMesh.rotation.y += 0.01;
    targetMesh.rotation.x += 0.005;

    camera.position.x = Math.sin(Date.now() * 0.0005) * 50;
    camera.lookAt(targetMesh.position);

    // Отрисовка 3D и 2D графики
    renderer.render(scene, camera);
    drawPFD();
    drawMap();

    // Обновление показателей OSD
    elLat.innerText = (state.lat + Math.sin(Date.now() * 0.0001) * 0.001).toFixed(4);
    elLon.innerText = (state.lon + Math.cos(Date.now() * 0.0001) * 0.001).toFixed(4);
    elAlt.innerText = state.alt.toFixed(1);
    elSpeed.innerText = Math.max(0, state.speed).toFixed(1);
    elTargetDist.innerText = (340 + Math.sin(Date.now() * 0.001) * 10).toFixed(0);

    // Разряд батареи
    state.battery -= 0.0005;
    if (state.battery < 0) state.battery = 100;
    elBat.innerText = Math.floor(state.battery) + '%';
  }

  animate();
});
