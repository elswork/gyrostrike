// --- CONFIGURACIÓN Y ESTADO DEL JUEGO ---
const CONFIG = {
    fov: 400,            // Distancia focal para la proyección 3D
    maxStars: 150,       // Cantidad de estrellas en el fondo
    maxDrones: 5,        // Límite de drones activos simultáneamente
    shootHeatRate: 20,   // Cuánto se calienta el arma por disparo
    coolRate: 0.8,       // Cuánto se enfría el arma por frame
    damageShield: 25,    // Daño recibido al escudo por impacto de dron
    damageArmor: 20,     // Daño recibido a la armadura cuando el escudo es 0
    laserDuration: 6,    // Duración del rayo láser en frames
    baseDroneSpeed: 4    // Velocidad inicial de los drones
};

const state = {
    playing: false,
    score: 0,
    wave: 1,
    multiplier: 1,
    killsInWave: 0,
    killsNeededForNextWave: 8,
    shield: 100,
    armor: 100,
    weaponHeat: 0,
    overheated: false,
    stars: [],
    drones: [],
    lasers: [],
    particles: [],
    // Variables de Navegación y Planeta Objetivo
    planetX: 0,
    planetY: 0,
    planetZ: 10000,
    targetPlanetX: 0,
    targetPlanetY: 0,
    targetPlanetZ: 10000,
    speed: 0,
    gridOffset: 0,
    // Variables Multijugador
    ws: null,
    myId: null,
    myColor: '#00f0ff',
    otherPlayers: new Map(), // id -> { id, color, yaw, pitch, score }
    // Control de cámara (Ángulos en radianes)
    camYaw: 0,           // Rotación horizontal (izquierda/derecha)
    camPitch: 0,         // Rotación vertical (arriba/abajo)
    // Referencias de calibración de sensores
    sensorRef: {
        alpha: null,     // Guiñada (Yaw)
        beta: null,      // Cabeceo (Pitch)
        gamma: null      // Alabeo (Roll)
    },
    currentSensors: {
        alpha: 0,
        beta: 0,
        gamma: 0
    },
    useGyro: false,
    hasSensorPermission: false,
    sensorEventsCount: 0,
    sensorEventsReceived: false,
    lastTouch: { x: 0, y: 0 },
    isDragging: false,
    screenRotated: false // true si está en landscape
};

// --- AUDIO SINTETIZADO (Web Audio API) ---
let audioCtx = null;

function initAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Crear un hum de fondo espacial continuo
    createSpaceHum();
}

function createSpaceHum() {
    if (!audioCtx) return;
    
    // Oscilador de graves para el motor de la nave
    const osc = audioCtx.createOscillator();
    const lfo = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const lfoGain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, audioCtx.currentTime); // Nota La1 muy grave

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.5, audioCtx.currentTime); // LFO muy lento

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, audioCtx.currentTime);
    filter.Q.setValueAtTime(5, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);

    // Modulación del filtro con el LFO
    lfoGain.gain.setValueAtTime(40, audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    lfo.start();
}

function playShootSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    // Caída rápida de frecuencia (pitch sweep)
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.16);
}

function playExplosionSound() {
    if (!audioCtx) return;
    // Generar ruido blanco
    const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 segundos
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.4);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start();
}

function playHitSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.11);
}

function playDamageSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.31);
}

function playOverheatWarning() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.16);
}

function playNewWaveSound() {
    if (!audioCtx) return;
    // Tocar un acorde arpegiado futurista
    const notes = [261.63, 329.63, 392.00, 523.25]; // Do Mayor
    notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.1);
        
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + index * 0.1 + 0.4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(audioCtx.currentTime + index * 0.1);
        osc.stop(audioCtx.currentTime + index * 0.1 + 0.45);
    });
}

// --- CONFIGURACIÓN DE CANVAS Y PANTALLA ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Detectar si estamos en modo landscape
    state.screenRotated = window.innerWidth > window.innerHeight;
    updateMobileControlsVisibility();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- INICIALIZACIÓN DE ELEMENTOS GRÁFICOS (3D PROYECTADO) ---

// Crear estrellas aleatorias en 3D
function initStars() {
    state.stars = [];
    for (let i = 0; i < CONFIG.maxStars; i++) {
        state.stars.push({
            x: (Math.random() - 0.5) * 2000,
            y: (Math.random() - 0.5) * 2000,
            z: Math.random() * 2000,
            size: Math.random() * 2 + 0.5
        });
    }
}

// Crear un dron invasor en 3D
function spawnDrone() {
    if (state.drones.length >= CONFIG.maxDrones) return;
    
    // Distribución espacial alrededor de la cámara, naciendo en la lejanía (z=1800)
    const angle = Math.random() * Math.PI * 2;
    const distance = 300 + Math.random() * 400; // Desplazamiento desde el centro
    
    // Diferentes tipos de diseño wireframe
    const types = ['cube', 'octahedron', 'diamond'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    state.drones.push({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        z: 1800 + Math.random() * 300,
        type: type,
        size: 35,
        speed: CONFIG.baseDroneSpeed + (state.wave * 0.4) + Math.random(),
        rotation: Math.random() * Math.PI,
        rotSpeed: 0.01 + Math.random() * 0.02,
        pulseOffset: Math.random() * Math.PI
    });
}

// --- MANEJO DE SENSORES Y GIROSCOPIO ---

// Obtener la IP local de forma decorativa (para ayudar en la conexión)
function checkIPAddress() {
    const loc = window.location;
    if (loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
        document.getElementById('ip-text').textContent = `Conectado a: ${loc.host}`;
    } else {
        // En local, intentar dar pistas
        document.getElementById('ip-text').textContent = `Abre: http://${window.location.hostname}:8080 en el móvil`;
    }
}
checkIPAddress();

// Solicitar permisos del giroscopio (necesario en iOS 13+)
async function requestSensorPermissions() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceOrientationEvent.requestPermission();
            if (permissionState === 'granted') {
                setupSensorListeners();
                return true;
            } else {
                showSensorFallback("Permiso de sensores denegado.");
                return false;
            }
        } catch (error) {
            console.error("Error pidiendo permisos del giroscopio: ", error);
            showSensorFallback("Error de sensores: " + error.message);
            return false;
        }
    } else {
        // En Android u otros dispositivos sin API de permiso explícita
        if (typeof window.DeviceOrientationEvent !== 'undefined' || 'ondeviceorientation' in window) {
            setupSensorListeners();
            return true;
        } else {
            showSensorFallback("Tu navegador no soporta DeviceOrientation.");
            return false;
        }
    }
}

function setupSensorListeners() {
    state.useGyro = true;
    state.hasSensorPermission = true;
    document.getElementById('status-message').textContent = "Sensores listos. Apunta al frente.";
    document.getElementById('btn-calibrate').classList.remove('hidden');
    
    const dbgApi = document.getElementById('dbg-api');
    if (dbgApi) {
        dbgApi.textContent = "CONECTADO";
        dbgApi.style.color = "var(--neon-green)";
    }
    
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('deviceorientationabsolute', handleOrientation);
}

function showSensorFallback(customMessage) {
    state.useGyro = false;
    document.getElementById('status-message').textContent = customMessage || "Giroscopio no disponible.";
    document.getElementById('sensor-fallback-info').classList.remove('hidden');
    
    const dbgApi = document.getElementById('dbg-api');
    if (dbgApi) {
        dbgApi.textContent = "INACTIVO (TÁCTIL)";
        dbgApi.style.color = "var(--neon-pink)";
    }
}

function handleOrientation(event) {
    // Evitar eventos vacíos (algunos navegadores envían eventos con valores null)
    if (event.alpha === null || event.beta === null) {
        return;
    }
    
    state.sensorEventsCount++;
    state.sensorEventsReceived = true;
    
    // Guardar lecturas de orientación
    state.currentSensors.alpha = event.alpha; // 0 a 360 (Z-axis, yaw)
    state.currentSensors.beta = event.beta;   // -180 a 180 (X-axis, pitch)
    state.currentSensors.gamma = event.gamma; // -90 a 90 (Y-axis, roll)
    
    // Actualizar diagnóstico en pantalla
    const elEvents = document.getElementById('dbg-events');
    if (elEvents) elEvents.textContent = state.sensorEventsCount;
    const elAlpha = document.getElementById('dbg-alpha');
    if (elAlpha) elAlpha.textContent = event.alpha.toFixed(1) + "°";
    const elBeta = document.getElementById('dbg-beta');
    if (elBeta) elBeta.textContent = event.beta.toFixed(1) + "°";
    const elGamma = document.getElementById('dbg-gamma');
    if (elGamma) elGamma.textContent = (event.gamma !== null ? event.gamma.toFixed(1) + "°" : "N/A");
    
    // Si no hemos calibrado, calibrar automáticamente con la primera lectura
    if (state.sensorRef.alpha === null) {
        calibrateSensors();
    }
    
    updateCameraFromSensors();
}

function calibrateSensors() {
    state.sensorRef.alpha = state.currentSensors.alpha;
    state.sensorRef.beta = state.currentSensors.beta;
    state.sensorRef.gamma = state.currentSensors.gamma;
    
    showGameAlert("🎯 ¡RECALIBRADO!");
    if (audioCtx) playHitSound();
}

function getRotationMatrix(alpha, beta, gamma) {
    const degToRad = Math.PI / 180;
    const a = alpha * degToRad;
    const b = beta * degToRad;
    const g = gamma * degToRad;

    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);

    // R = Rz(a) * Rx(b) * Ry(g)
    return [
        cA * cG - sA * sB * sG,  -sA * cB,  cA * sG + sA * sB * cG,
        sA * cG + cA * sB * sG,   cA * cB,  sA * sG - cA * sB * cG,
        -cB * sG,                 sB,       cB * cG
    ];
}

function updateCameraFromSensors() {
    if (!state.useGyro) return;
    
    if (state.sensorRef.alpha === null) {
        calibrateSensors();
        return;
    }
    
    const rRef = getRotationMatrix(state.sensorRef.alpha, state.sensorRef.beta, state.sensorRef.gamma);
    const rCurr = getRotationMatrix(state.currentSensors.alpha, state.currentSensors.beta, state.currentSensors.gamma);
    
    // Calcular la tercera columna de R_rel = R_ref^T * R_curr
    const rRel13 = rRef[0] * rCurr[2] + rRef[3] * rCurr[5] + rRef[6] * rCurr[8];
    const rRel23 = rRef[1] * rCurr[2] + rRef[4] * rCurr[5] + rRef[7] * rCurr[8];
    const rRel33 = rRef[2] * rCurr[2] + rRef[5] * rCurr[5] + rRef[8] * rCurr[8];
    
    // El vector relativo apuntando es: xr = -rRel13, yr = -rRel23, zr = -rRel33
    const xr = -rRel13;
    const yr = -rRel23;
    const zr = -rRel33;
    
    const xs = xr;
    const ys = yr;
    const zs = zr;
    
    // Calcular yaw y pitch usando la proyección 3D del vector de dirección con clamp de seguridad para evitar NaN en asin
    const yaw = Math.atan2(xs, zs);
    const pitch = Math.asin(Math.max(-1.0, Math.min(1.0, ys)));
    
    // --- PARÁMETROS CONFIGURABLES ---
    const SENSITIVITY = 2.0;   // Multiplicador de escala física
    const INPUT_LERP = 0.16;   // Nivel de suavizado (0.01 = ultra suave/lento, 1.0 = instantáneo/brusco)
    const DEADZONE = 0.01;     // Ángulo mínimo (en radianes) a ignorar para filtrar temblores

    // Filtrar pequeñas variaciones estáticas
    let targetYaw = -yaw * SENSITIVITY;
    let targetPitch = pitch * SENSITIVITY;
    
    if (Math.abs(yaw) < DEADZONE) targetYaw = 0;
    if (Math.abs(pitch) < DEADZONE) targetPitch = 0;

    // Calcular la diferencia de ángulo más corta (normalizada a [-PI, PI]) para evitar giros bruscos de 360 grados
    let diffYaw = targetYaw - state.camYaw;
    diffYaw = Math.atan2(Math.sin(diffYaw), Math.cos(diffYaw));
    state.camYaw += diffYaw * INPUT_LERP;
    
    let diffPitch = targetPitch - state.camPitch;
    diffPitch = Math.atan2(Math.sin(diffPitch), Math.cos(diffPitch));
    state.camPitch += diffPitch * INPUT_LERP;
    
    // Limitar la inclinación vertical máxima para no voltear del todo la cámara
    state.camPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, state.camPitch));
}

// --- INTERACCIÓN Y CONTROLES TÁCTILES ---

function shoot(clientX, clientY) {
    if (state.overheated || !state.playing) return;
    
    // Inicializar audio en la primera interacción
    initAudio();
    
    // El punto de disparo en la pantalla es el centro (donde apunta el HUD)
    const targetX = canvas.width / 2;
    const targetY = canvas.height / 2;
    
    // Añadir línea de láser de nuestro propio color
    state.lasers.push({
        startX1: 0,
        startY1: canvas.height,
        startX2: canvas.width,
        startY2: canvas.height,
        endX: targetX,
        endY: targetY,
        life: CONFIG.laserDuration,
        color: state.myColor
    });
    
    // Efecto de audio y vibración
    playShootSound();
    if (navigator.vibrate) {
        navigator.vibrate(80); // Vibrar 80ms
    }
    
    // Incrementar calor del arma
    state.weaponHeat = Math.min(100, state.weaponHeat + CONFIG.shootHeatRate);
    if (state.weaponHeat >= 100) {
        state.overheated = true;
        document.getElementById('overheat-warning').classList.remove('hidden');
        playOverheatWarning();
    }
    
    // Enviar disparo al servidor WebSocket (el servidor decidirá la colisión)
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'shoot',
            yaw: state.camYaw,
            pitch: state.camPitch
        }));
    }
}

// Control táctil para simular giroscopio en escritorio o si falla el sensor
canvas.addEventListener('pointerdown', (e) => {
    if (!state.playing) return;
    
    if (!state.useGyro) {
        state.isDragging = true;
        state.lastTouch.x = e.clientX;
        state.lastTouch.y = e.clientY;
    }
    
    shoot(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
    if (state.isDragging && !state.useGyro && state.playing) {
        const dx = e.clientX - state.lastTouch.x;
        const dy = e.clientY - state.lastTouch.y;
        
        // Mover la cámara según el arrastre
        state.camYaw -= dx * 0.005;
        state.camPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, state.camPitch + dy * 0.005));
        
        state.lastTouch.x = e.clientX;
        state.lastTouch.y = e.clientY;
    }
});

canvas.addEventListener('pointerup', () => {
    state.isDragging = false;
});

// --- LÓGICA DE PROYECCIÓN 3D ---

// Traduce coordenadas 3D del espacio a coordenadas relativas al ángulo de la cámara (Yaw / Pitch)
function getRelative3D(x, y, z) {
    // 1. Rotación horizontal (Yaw / camYaw) alrededor del eje Y
    const cosY = Math.cos(state.camYaw);
    const sinY = Math.sin(state.camYaw);
    let x1 = x * cosY - z * sinY;
    let z1 = x * sinY + z * cosY;
    
    // 2. Rotación vertical (Pitch / camPitch) alrededor del eje X
    const cosP = Math.cos(state.camPitch);
    const sinP = Math.sin(state.camPitch);
    let y2 = y * cosP - z1 * sinP;
    let z2 = y * sinP + z1 * cosP;
    
    return { x: x1, y: y2, z: z2 };
}

// --- CICLO DE ACTUALIZACIÓN DEL JUEGO ---

function update() {
    // Reducir la sacudida de pantalla gradualmente
    if (state.screenShake > 0) {
        state.screenShake = Math.max(0, state.screenShake - 0.7);
    }

    // 1. Enfriamiento del arma
    if (state.weaponHeat > 0) {
        state.weaponHeat = Math.max(0, state.weaponHeat - CONFIG.coolRate);
        if (state.weaponHeat === 0 && state.overheated) {
            state.overheated = false;
            document.getElementById('overheat-warning').classList.add('hidden');
        }
    }
    
    // 2. Estrellas: moverlas según la velocidad de la nave para dar sensación de aceleración/viaje
    const starSpeed = 0.5 + (state.speed * 0.08);
    state.stars.forEach(star => {
        star.z -= starSpeed;
        if (star.z <= 0) {
            star.z = 2000;
            star.x = (Math.random() - 0.5) * 2000;
            star.y = (Math.random() - 0.5) * 2000;
        }
    });
    
    // 3. Drones: interpolación suave hacia las posiciones autoritativas del servidor (evita saltos bruscos)
    state.drones.forEach(drone => {
        if (drone.targetX !== undefined) {
            const lerpFactor = 0.18; // Suavizado de movimiento (18% del camino por frame)
            drone.x += (drone.targetX - drone.x) * lerpFactor;
            drone.y += (drone.targetY - drone.y) * lerpFactor;
            drone.z += (drone.targetZ - drone.z) * lerpFactor;
        } else {
            drone.z -= drone.speed || 4;
        }
        drone.rotation = (drone.rotation || 0) + 0.02;
    });
    
    // 3.5 Planeta Objetivo: interpolación suave de posición
    if (state.targetPlanetX !== undefined) {
        const lerpFactor = 0.18;
        state.planetX += (state.targetPlanetX - state.planetX) * lerpFactor;
        state.planetY += (state.targetPlanetY - state.planetY) * lerpFactor;
        state.planetZ += (state.targetPlanetZ - state.planetZ) * lerpFactor;
    }
    
    // 4. Lasers: reducir vida útil (bucle inverso)
    for (let i = state.lasers.length - 1; i >= 0; i--) {
        state.lasers[i].life--;
        if (state.lasers[i].life <= 0) {
            state.lasers.splice(i, 1);
        }
    }
    
    // 5. Partículas: física elemental (bucle inverso)
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.life -= p.decay;
        if (p.life <= 0) {
            state.particles.splice(i, 1);
        }
    }
    
    // Enviar coordenadas de mira al servidor en tiempo real (limitado a 30Hz)
    const now = Date.now();
    if (now - (state.lastSendTime || 0) > 33) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'move',
                yaw: state.camYaw,
                pitch: state.camPitch
            }));
            state.lastSendTime = now;
        }
    }
    
    updateHudElements();
}

function takeDamage() {
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // Patrón de vibración de daño
    }
    
    // Animación de flash de pantalla rojo
    canvasFlashRed();
    
    if (state.shield > 0) {
        state.shield = Math.max(0, state.shield - CONFIG.damageShield);
    } else {
        state.armor = Math.max(0, state.armor - CONFIG.damageArmor);
        if (state.armor <= 0) {
            gameOver();
        }
    }
    
    state.multiplier = 1; // Reset multiplicador
    updateHud();
}

let flashRedIntensity = 0;
function canvasFlashRed() {
    flashRedIntensity = 0.5;
}

function drawDroneWireframe(ctx, type, radius) {
    ctx.beginPath();
    if (type === 'octahedron') {
        // Rombo wireframe 3D
        ctx.moveTo(0, -radius);
        ctx.lineTo(radius * 0.7, 0);
        ctx.lineTo(0, radius);
        ctx.lineTo(-radius * 0.7, 0);
        ctx.closePath();
        
        ctx.moveTo(-radius * 0.7, 0);
        ctx.lineTo(0, -radius * 0.2);
        ctx.lineTo(radius * 0.7, 0);
        
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, -radius * 0.2);
        ctx.lineTo(0, radius);
    } else if (type === 'cube') {
        // Cubo wireframe en perspectiva plana
        const rOffset = radius * 0.45;
        ctx.rect(-rOffset, -rOffset, radius * 0.9, radius * 0.9);
        ctx.rect(-rOffset + rOffset*0.3, -rOffset - rOffset*0.3, radius * 0.9, radius * 0.9);
        // Conexiones de esquinas
        ctx.moveTo(-rOffset, -rOffset);
        ctx.lineTo(-rOffset + rOffset*0.3, -rOffset - rOffset*0.3);
        ctx.moveTo(rOffset, -rOffset);
        ctx.lineTo(rOffset + rOffset*0.3, -rOffset - rOffset*0.3);
        ctx.moveTo(-rOffset, rOffset);
        ctx.lineTo(-rOffset + rOffset*0.3, rOffset - rOffset*0.3);
        ctx.moveTo(rOffset, rOffset);
        ctx.lineTo(rOffset + rOffset*0.3, rOffset - rOffset*0.3);
    } else {
        // Diamante básico
        ctx.moveTo(0, -radius * 1.2);
        ctx.lineTo(radius * 0.6, 0);
        ctx.lineTo(0, radius * 1.2);
        ctx.lineTo(-radius * 0.6, 0);
        ctx.closePath();
        ctx.moveTo(-radius * 0.6, 0);
        ctx.lineTo(radius * 0.6, 0);
    }
}

function draw() {
    ctx.save();
    
    // --- PARÁMETROS CONFIGURABLES ---
    const SHAKE_MULTIPLIER = 1.2; // Multiplicador de intensidad de la sacudida
    
    // Aplicar vibración visual al renderizado si hay screenShake activo
    if (state.screenShake > 0) {
        const dx = (Math.random() - 0.5) * state.screenShake * SHAKE_MULTIPLIER;
        const dy = (Math.random() - 0.5) * state.screenShake * SHAKE_MULTIPLIER;
        ctx.translate(dx, dy);
    }

    // Actualizar diagnóstico de cámara (para modo táctil o giroscopio)
    const dbgCam = document.getElementById('dbg-cam');
    if (dbgCam) {
        dbgCam.textContent = `Y:${state.camYaw.toFixed(2)} P:${state.camPitch.toFixed(2)}`;
    }

    // Fondo espacial profundo
    ctx.fillStyle = '#03030d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Filtro de daño (rojo)
    if (flashRedIntensity > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${flashRedIntensity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashRedIntensity -= 0.02;
    }
    
    // 1. Dibujar Estrellas en Parallax 3D
    ctx.fillStyle = '#ffffff';
    state.stars.forEach(star => {
        const rel = getRelative3D(star.x, star.y, star.z);
        
        if (rel.z <= 10) return; // Detrás de la cámara
        
        const scale = CONFIG.fov / rel.z;
        const screenX = canvas.width / 2 + rel.x * scale;
        const screenY = canvas.height / 2 + rel.y * scale;
        
        if (screenX >= 0 && screenX < canvas.width && screenY >= 0 && screenY < canvas.height) {
            const opacity = Math.min(1, (2000 - rel.z) / 1000); // Se desvanecen en la distancia
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
            ctx.beginPath();
            ctx.arc(screenX, screenY, star.size * scale * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 2. Dibujar una retícula de cuadrícula espacial (Grid) para mayor sensación de velocidad
    drawSpatialGrid();

    // 3. Dibujar Partículas
    state.particles.forEach(p => {
        const rel = getRelative3D(p.x, p.y, p.z);
        if (rel.z <= 10) return;
        const scale = CONFIG.fov / rel.z;
        const screenX = canvas.width / 2 + rel.x * scale;
        const screenY = canvas.height / 2 + rel.y * scale;
        const radius = Math.max(1, 3 * scale);
        
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // 4. Dibujar Drones Invasores (Wireframes 3D luminosos sin usar shadowBlur)
    state.drones.forEach(drone => {
        const rel = getRelative3D(drone.x, drone.y, drone.z);
        if (rel.z <= 20) return;
        
        const scale = CONFIG.fov / rel.z;
        const screenX = canvas.width / 2 + rel.x * scale;
        const screenY = canvas.height / 2 + rel.y * scale;
        
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(drone.rotation || 0);
        
        const radius = (drone.size / rel.z) * CONFIG.fov;
        
        // Capa 1: Resplandor translúcido (Glow)
        ctx.strokeStyle = 'rgba(255, 0, 127, 0.25)';
        ctx.lineWidth = Math.max(4, 9 * scale);
        drawDroneWireframe(ctx, drone.type, radius);
        ctx.stroke();
        
        // Capa 2: Núcleo brillante sólido (Core)
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = Math.max(1, 2 * scale);
        drawDroneWireframe(ctx, drone.type, radius);
        ctx.stroke();
        
        ctx.restore();
        
        // Dibujar indicador de distancia
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '10px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(rel.z)}m`, screenX, screenY + radius + 15);
    });

    // 4.5 Dibujar Planeta Objetivo (si está en rango visual)
    const pRel = getRelative3D(state.planetX, state.planetY, state.planetZ);
    const planetDist = Math.sqrt(state.planetX * state.planetX + state.planetY * state.planetY + state.planetZ * state.planetZ);
    let planetOnScreen = false;
    let pScreenX = 0, pScreenY = 0;
    
    if (pRel.z > 50) {
        const pScale = CONFIG.fov / pRel.z;
        pScreenX = canvas.width / 2 + pRel.x * pScale;
        pScreenY = canvas.height / 2 + pRel.y * pScale;
        
        // El tamaño del planeta base es 450
        const pRadius = (450 / pRel.z) * CONFIG.fov;
        
        if (pRadius > 2) {
            ctx.save();
            // Crear gradiente esférico para efecto 3D
            const grad = ctx.createRadialGradient(
                pScreenX - pRadius * 0.3,
                pScreenY - pRadius * 0.3,
                pRadius * 0.05,
                pScreenX,
                pScreenY,
                pRadius
            );
            grad.addColorStop(0, '#00f0ff');   // Cyan centro de luz
            grad.addColorStop(0.3, '#7b00ff'); // Púrpura medio
            grad.addColorStop(0.7, '#ff007f'); // Rosa exterior
            grad.addColorStop(1, '#020208');   // Borde sombreado oscuro
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pScreenX, pScreenY, pRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Atmósfera exterior brillante
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
            ctx.lineWidth = Math.max(1, 4 * pScale);
            ctx.stroke();
            
            // Nombre del planeta e indicador de distancia
            ctx.fillStyle = '#00f0ff';
            ctx.font = 'bold 12px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText("PLANETA OBJETIVO", pScreenX, pScreenY - pRadius - 15);
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Orbitron';
            ctx.fillText(`${Math.round(planetDist)}m`, pScreenX, pScreenY - pRadius - 2);
            ctx.restore();
            
            // Verificar si el planeta está visible en la pantalla
            if (pScreenX >= 40 && pScreenX <= canvas.width - 40 && pScreenY >= 40 && pScreenY <= canvas.height - 40) {
                planetOnScreen = true;
            }
        }
    }
    
    // 4.6 Dibujar indicador de planeta siempre en pantalla si está fuera de vista
    if (!planetOnScreen) {
        ctx.save();
        // Calcular vector hacia el planeta en coordenadas relativas
        let dx = pRel.x;
        let dy = pRel.y;
        
        // Si el planeta está detrás, invertimos el vector para que apunte en la dirección correcta si nos damos la vuelta
        if (pRel.z <= 50) {
            dx = -pRel.x;
            dy = -pRel.y;
            // Si el planeta está justo detrás, asegurar que no sea exactamente cero
            if (dx === 0 && dy === 0) dx = 1;
        }
        
        const angle = Math.atan2(dy, dx);
        
        // Encontrar punto en el borde de la pantalla
        const margin = 50;
        const halfW = canvas.width / 2 - margin;
        const halfH = canvas.height / 2 - margin;
        
        let edgeX, edgeY;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        if (Math.abs(cosA * halfH) > Math.abs(sinA * halfW)) {
            edgeX = canvas.width / 2 + Math.sign(cosA) * halfW;
            edgeY = canvas.height / 2 + (Math.sign(cosA) * halfW) * (sinA / cosA);
        } else {
            edgeX = canvas.width / 2 + (Math.sign(sinA) * halfH) * (cosA / sinA);
            edgeY = canvas.height / 2 + Math.sign(sinA) * halfH;
        }
        
        // Dibujar flecha indicadora parpadeante de color Cyan/Rosa
        const timeFactor = (Date.now() % 1000) / 1000;
        const alphaVal = 0.5 + Math.sin(timeFactor * Math.PI * 2) * 0.3;
        
        ctx.strokeStyle = `rgba(0, 240, 255, ${alphaVal})`;
        ctx.fillStyle = `rgba(255, 0, 127, ${alphaVal})`;
        ctx.lineWidth = 2;
        
        // Dibujar triángulo rotado
        ctx.translate(edgeX, edgeY);
        ctx.rotate(angle);
        
        ctx.beginPath();
        ctx.moveTo(15, 0);   // Punta
        ctx.lineTo(-8, -8);  // Esquina izquierda
        ctx.lineTo(-3, 0);   // Hendidura centro
        ctx.lineTo(-8, 8);   // Esquina derecha
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Añadir icono del planeta e indicador de distancia
        ctx.rotate(-angle); // Deshacer rotación para pintar texto derecho
        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 9px Orbitron';
        ctx.textAlign = edgeX < canvas.width / 2 ? 'left' : 'right';
        const textOffsetX = edgeX < canvas.width / 2 ? 20 : -20;
        ctx.fillText(`🪐 ${Math.round(planetDist)}m`, textOffsetX, 3);
        
        ctx.restore();
    }

    // 5. Dibujar Láseres de Disparo (Optimizado con doble trazado y sin shadowBlur)
    state.lasers.forEach(laser => {
        const color = laser.color || '#00f0ff';
        const glowColor = color.startsWith('#') ? hexToRgbA(color, 0.25) : 'rgba(0, 240, 255, 0.22)';
        
        // Capa 1: Resplandor (Glow)
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = laser.life * 4;
        ctx.beginPath();
        ctx.moveTo(laser.startX1, laser.startY1);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.moveTo(laser.startX2, laser.startY2);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
        
        // Capa 2: Núcleo (Core)
        ctx.strokeStyle = color;
        ctx.lineWidth = laser.life * 1.2;
        ctx.beginPath();
        ctx.moveTo(laser.startX1, laser.startY1);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.moveTo(laser.startX2, laser.startY2);
        ctx.lineTo(laser.endX, laser.endY);
        ctx.stroke();
    });

    // 5.5 Dibujar Miras de otros Jugadores (Co-op Pointers)
    state.otherPlayers.forEach(player => {
        const x = Math.sin(player.yaw) * Math.cos(player.pitch) * 500;
        const y = Math.sin(player.pitch) * 500;
        const z = Math.cos(player.yaw) * Math.cos(player.pitch) * 500;
        
        const rel = getRelative3D(x, y, z);
        
        if (rel.z > 10) {
            const scale = CONFIG.fov / rel.z;
            const screenX = canvas.width / 2 + rel.x * scale;
            const screenY = canvas.height / 2 + rel.y * scale;
            
            ctx.save();
            // Resplandor del puntero del amigo
            ctx.strokeStyle = hexToRgbA(player.color, 0.25);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
            ctx.stroke();
            
            // Núcleo
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
            ctx.stroke();
            
            // Identificador de jugador
            ctx.fillStyle = player.color;
            ctx.font = 'bold 9px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(`JUGADOR ${player.id}`, screenX, screenY - 18);
            ctx.restore();
        }
    });

    // 6. Dibujar el HUD/Puntero central del cañón (Cockpit Targeter)
    drawReticle();

    // 7. Dibujar información de velocidad y navegación (HUD lateral)
    ctx.save();
    // Cuadro de navegación en la parte superior izquierda
    ctx.fillStyle = 'rgba(6, 6, 20, 0.65)';
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(20, 80, 180, 60, 6);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 9px Orbitron';
    ctx.fillText("SISTEMA DE NAVEGACIÓN", 30, 98);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px Orbitron';
    ctx.fillText(`VELOCIDAD: ${Math.round(state.speed)} km/h`, 30, 116);
    ctx.fillText(`DISTANCIA: ${Math.round(planetDist)} m`, 30, 131);
    ctx.restore();
    ctx.restore(); // Restaurar el ctx.save() inicial del screenShake
}

function drawSpatialGrid() {
    // Dibujamos unas líneas radiales que parten del centro proyectado de la pantalla
    // basadas en nuestro rumbo (camYaw y camPitch) para simular un túnel de datos
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Incrementar offset del grid según velocidad de la nave para dar efecto túnel
    state.gridOffset = (state.gridOffset || 0) + (0.3 + state.speed * 0.05);
    state.gridOffset %= 150;
    
    // Líneas circulares de referencia (HUD de navegación en el espacio) que se expanden
    const ringCount = 5;
    for (let i = 0; i <= ringCount; i++) {
        const radius = (150 * i) + state.gridOffset;
        // Desvanecimiento suave en los bordes y en el centro
        const opacity = Math.min(0.12, (1 - (radius / 900)) * 0.15);
        ctx.strokeStyle = `rgba(0, 240, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Ejes horizontales y verticales
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(centerX - 400, centerY);
    ctx.lineTo(centerX + 400, centerY);
    ctx.moveTo(centerX, centerY - 300);
    ctx.lineTo(centerX, centerY + 300);
    ctx.stroke();
}

function drawReticle() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    const color = state.overheated ? '#ff007f' : '#00f0ff';
    const glowColor = state.overheated ? 'rgba(255, 0, 127, 0.25)' : 'rgba(0, 240, 255, 0.25)';
    
    // 1. Capa de resplandor exterior (Glow)
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 5;
    drawReticlePath(ctx, cx, cy);
    
    // 2. Capa central brillante (Core)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    drawReticlePath(ctx, cx, cy);
    
    // Punto central de la mira
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawReticlePath(ctx, cx, cy) {
    // Círculo central
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    
    // Soportes perimetrales de la mira (brackets rectos)
    const bSize = 8;
    ctx.beginPath();
    // Arriba-Izquierda
    ctx.moveTo(cx - 30, cy - 30);
    ctx.lineTo(cx - 30 + bSize, cy - 30);
    ctx.moveTo(cx - 30, cy - 30);
    ctx.lineTo(cx - 30, cy - 30 + bSize);
    
    // Arriba-Derecha
    ctx.moveTo(cx + 30, cy - 30);
    ctx.lineTo(cx + 30 - bSize, cy - 30);
    ctx.moveTo(cx + 30, cy - 30);
    ctx.lineTo(cx + 30, cy - 30 + bSize);
    
    // Abajo-Izquierda
    ctx.moveTo(cx - 30, cy + 30);
    ctx.lineTo(cx - 30 + bSize, cy + 30);
    ctx.moveTo(cx - 30, cy + 30);
    // Abajo-Derecha
    ctx.moveTo(cx + 30, cy + 30);
    ctx.lineTo(cx + 30 - bSize, cy + 30);
    ctx.moveTo(cx + 30, cy + 30);
    ctx.lineTo(cx + 30, cy + 30 - bSize);
    
    ctx.stroke();
}

// --- FLUJO GENERAL DEL JUEGO ---

function initGame() {
    state.playing = true;
    state.multiplier = 1;
    state.weaponHeat = 0;
    state.overheated = false;
    state.sensorEventsCount = 0; // Resetear contador para verificar si llegan lecturas reales
    state.screenShake = 0;       // Inicializar sacudida
    
    // --- PARÁMETROS CONFIGURABLES ---
    const AUTO_CALIBRATE_DELAY = 600; // Tiempo en ms para calibrar después de iniciar

    // Autocalibración automática retardada para favorecer una postura cómoda
    setTimeout(() => {
        if (state.playing) {
            calibrateSensors();
        }
    }, AUTO_CALIBRATE_DELAY);
    
    // Resetear velocidad y acelerador visual a 0
    state.speed = 0;
    updateThrottleUI(0);
    updateMobileControlsVisibility();
    
    initStars();
    state.drones = [];
    state.lasers = [];
    state.particles = [];
    
    updateHud();
    
    document.getElementById('overlay').classList.remove('active');
    document.getElementById('hud').classList.remove('hidden');
    
    showGameAlert("SECTOR NEÓN COOPERATIVO");
    playNewWaveSound();
    
    // Comprobar si realmente estamos recibiendo eventos de orientación tras el arranque
    if (state.useGyro) {
        setTimeout(() => {
            if (state.sensorEventsCount === 0) {
                console.warn("No se reciben lecturas del sensor. Activando fallback táctil.");
                state.useGyro = false;
                showGameAlert("⚠️ MODO TÁCTIL (Arrastra para apuntar)");
            }
        }, 1500);
    }
    
    gameLoop();
}

function takeDamageEffects() {
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // Patrón de vibración de daño
    }
    canvasFlashRed();
    state.multiplier = 1; // Reset multiplicador
    if (audioCtx) playDamageSound();
    updateHud();
}

function gameOverMultiplayer(score, wave) {
    state.playing = false;
    document.getElementById('hud').classList.add('hidden');
    updateMobileControlsVisibility(); // Ocultar controles táctiles móviles
    
    const overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    
    // Cambiar textos para pantalla de Game Over
    overlay.querySelector('.glow-text').innerHTML = "FIN DEL <span>VUELO</span>";
    overlay.querySelector('.subtitle').textContent = `SCORE EQUIPO: ${score}`;
    overlay.querySelector('.instructions').innerHTML = `
        Habéis defendido el sector en equipo.<br>
        Llegasteis hasta la <strong>Oleada ${wave}</strong> con una puntuación colectiva de <strong>${score}</strong>.<br><br>
        Pulsa el botón de abajo para reintentar la defensa galáctica.
    `;
    overlay.querySelector('#btn-start').textContent = "REINICIAR SIMULACIÓN";
    
    // Cerrar WebSocket para resetear la partida
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
}

function updateHud() {
    document.getElementById('score-val').textContent = String(state.score).padStart(5, '0');
    document.getElementById('wave-val').textContent = state.wave;
    document.getElementById('mult-val').textContent = `x${state.multiplier}`;
}

function updateHudElements() {
    // Barras de progreso físicas
    document.getElementById('shield-bar').style.width = `${state.shield}%`;
    document.getElementById('armor-bar').style.width = `${state.armor}%`;
    document.getElementById('heat-bar').style.width = `${state.weaponHeat}%`;
}

function showGameAlert(text) {
    const el = document.getElementById('game-alert');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    
    // Clonar elemento para reiniciar la animación de CSS
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    
    setTimeout(() => {
        const currentAlert = document.getElementById('game-alert');
        if (currentAlert) currentAlert.classList.add('hidden');
    }, 1500);
}

// Bucle principal recurrente
function gameLoop() {
    if (!state.playing) return;
    
    update();
    draw();
    
    requestAnimationFrame(gameLoop);
}

// Helper para convertir color hex a rgba para el trazado de resplandor (glow)
function hexToRgbA(hex, alpha = 1) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length === 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    }
    return hex;
}

// Conexión y gestión del canal WebSocket en tiempo real
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    state.ws = new WebSocket(wsUrl);
    
    state.ws.onopen = () => {
        console.log("Conectado al servidor multijugador.");
    };
    
    state.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            
            if (msg.type === 'welcome') {
                state.myId = msg.id;
                state.myColor = msg.color;
                state.wave = msg.wave;
                state.shield = msg.shield;
                state.armor = msg.armor;
                if (msg.planetX !== undefined) {
                    state.planetX = msg.planetX;
                    state.planetY = msg.planetY;
                    state.planetZ = msg.planetZ;
                    state.targetPlanetX = msg.planetX;
                    state.targetPlanetY = msg.planetY;
                    state.targetPlanetZ = msg.planetZ;
                }
                updateHud();
            }
            
            else if (msg.type === 'state') {
                // Actualizar drones existentes o crear nuevos con interpolación suave
                const updatedDrones = [];
                msg.drones.forEach(serverDrone => {
                    let localDrone = state.drones.find(d => d.id === serverDrone.id);
                    if (localDrone) {
                        // Actualizar objetivos del servidor
                        localDrone.targetX = serverDrone.x;
                        localDrone.targetY = serverDrone.y;
                        localDrone.targetZ = serverDrone.z;
                        localDrone.speed = serverDrone.speed;
                        localDrone.type = serverDrone.type;
                        localDrone.size = serverDrone.size;
                    } else {
                        // Crear dron con posición inicial y objetivo iguales
                        localDrone = {
                            id: serverDrone.id,
                            x: serverDrone.x,
                            y: serverDrone.y,
                            z: serverDrone.z,
                            targetX: serverDrone.x,
                            targetY: serverDrone.y,
                            targetZ: serverDrone.z,
                            speed: serverDrone.speed,
                            type: serverDrone.type,
                            size: serverDrone.size,
                            rotation: 0
                        };
                    }
                    updatedDrones.push(localDrone);
                });
                state.drones = updatedDrones;
                
                if (msg.planetX !== undefined) {
                    state.targetPlanetX = msg.planetX;
                    state.targetPlanetY = msg.planetY;
                    state.targetPlanetZ = msg.planetZ;
                    state.speed = msg.speed;
                }
                
                state.shield = msg.shield;
                state.armor = msg.armor;
                state.wave = msg.wave;
                
                const incomingPlayers = new Map();
                msg.players.forEach(p => {
                    if (p.id !== state.myId) {
                        incomingPlayers.set(p.id, p);
                    } else {
                        state.score = p.score;
                    }
                });
                state.otherPlayers = incomingPlayers;
                updateHud();
            }
            
            else if (msg.type === 'shoot') {
                if (msg.playerId !== state.myId) {
                    const x = Math.sin(msg.yaw) * Math.cos(msg.pitch) * 500;
                    const y = Math.sin(msg.pitch) * 500;
                    const z = Math.cos(msg.yaw) * Math.cos(msg.pitch) * 500;
                    
                    const rel = getRelative3D(x, y, z);
                    
                    if (rel.z > 10) {
                        const scale = CONFIG.fov / rel.z;
                        const projX = canvas.width / 2 + rel.x * scale;
                        const projY = canvas.height / 2 + rel.y * scale;
                        
                        const pData = state.otherPlayers.get(msg.playerId);
                        const color = pData ? pData.color : '#ffffff';
                        
                        state.lasers.push({
                            startX1: 0,
                            startY1: canvas.height,
                            startX2: canvas.width,
                            startY2: canvas.height,
                            endX: projX,
                            endY: projY,
                            life: CONFIG.laserDuration,
                            color: color
                        });
                    }
                }
            }
            
            else if (msg.type === 'hit') {
                playExplosionSound();
                
                // Vibración corta táctil al derribar nave
                if (navigator.vibrate) {
                    navigator.vibrate(40);
                }
                
                const pCount = 15;
                const pData = state.otherPlayers.get(msg.playerId);
                const color = (msg.playerId === state.myId) ? state.myColor : (pData ? pData.color : '#ff007f');
                
                for (let i = 0; i < pCount; i++) {
                    const speed = 3 + Math.random() * 6;
                    const angle = Math.random() * Math.PI * 2;
                    const angle2 = Math.random() * Math.PI;
                    
                    state.particles.push({
                        x: msg.x,
                        y: msg.y,
                        z: msg.z,
                        vx: Math.cos(angle) * Math.sin(angle2) * speed,
                        vy: Math.sin(angle) * Math.sin(angle2) * speed,
                        vz: Math.cos(angle2) * speed,
                        color: color,
                        life: 1.0,
                        decay: 0.03 + Math.random() * 0.03
                    });
                }
                
                if (msg.playerId === state.myId) {
                    state.multiplier = Math.min(5, state.multiplier + 1);
                }
            }
            
            else if (msg.type === 'damage') {
                state.shield = msg.shield;
                state.armor = msg.armor;
                
                // Activar sacudida física de pantalla (game juice)
                state.screenShake = 12;
                
                // Velo rojo de impacto
                takeDamageEffects();
                
                // API Háptica móvil (Vibrar 120ms)
                if (navigator.vibrate) {
                    navigator.vibrate(120);
                }
            }
            
            else if (msg.type === 'waveStart') {
                state.wave = msg.wave;
                state.shield = msg.shield;
                if (msg.planetX !== undefined) {
                    state.planetX = msg.planetX;
                    state.planetY = msg.planetY;
                    state.planetZ = msg.planetZ;
                    state.targetPlanetX = msg.planetX;
                    state.targetPlanetY = msg.planetY;
                    state.targetPlanetZ = msg.planetZ;
                    state.speed = 0;
                }
                updateThrottleUI(0); // Resetear acelerador visual a cero al pasar de pantalla
                showGameAlert(`OLEADA COOPERATIVA ${state.wave}`);
                playNewWaveSound();
                updateHud();
            }
            
            else if (msg.type === 'gameover') {
                gameOverMultiplayer(msg.score, msg.wave);
            }
        } catch (e) {
            console.error("Error al procesar mensaje de WS:", e);
        }
    };
    
    state.ws.onclose = () => {
        console.warn("Conexión de WS cerrada.");
        if (state.playing) {
            showGameAlert("CONEXIÓN PERDIDA");
            setTimeout(() => {
                if (state.playing) {
                    state.playing = false;
                    document.getElementById('hud').classList.add('hidden');
                    document.getElementById('overlay').classList.add('active');
                }
            }, 1000);
        }
    };
}

// --- BINDINGS DE EVENTOS DOM ---

document.getElementById('btn-start').addEventListener('click', async () => {
    // Inicializar audio y solicitar permisos del giroscopio
    initAudio();
    
    // Conectar al WebSocket multijugador antes de iniciar
    connectWebSocket();
    
    const hasGyro = await requestSensorPermissions();
    
    if (hasGyro) {
        // Breve retraso para asegurar calibración correcta tras activar sensores
        setTimeout(() => {
            calibrateSensors();
            initGame();
        }, 300);
    } else {
        initGame();
    }
});

document.getElementById('btn-calibrate').addEventListener('click', () => {
    calibrateSensors();
});

document.getElementById('btn-game-calibrate').addEventListener('click', (e) => {
    e.stopPropagation(); // Evita disparar al hacer clic en el botón de calibración
    calibrateSensors();
});

// Calibración por teclado (barra espaciadora o tecla C) en escritorio
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyC') {
        calibrateSensors();
    }
});

// Pantalla completa (Fullscreen API)
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error al intentar activar pantalla completa: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });
}

const btnGameFullscreen = document.getElementById('btn-game-fullscreen');
if (btnGameFullscreen) {
    btnGameFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });
}


// Inicializar el fondo espacial de pantalla de título al cargar
initStars();
function drawMenuBackground() {
    if (state.playing) return;
    
    // Si no está jugando, simular giroscopio flotante de menú
    state.camYaw = Math.sin(Date.now() * 0.0005) * 0.15;
    state.camPitch = Math.cos(Date.now() * 0.0007) * 0.1;
    
    ctx.fillStyle = '#03030d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Estrellas
    ctx.fillStyle = '#ffffff';
    state.stars.forEach(star => {
        // En menú, vuelan rápido hacia adelante
        star.z -= 1.5;
        if (star.z <= 0) star.z = 2000;
        
        const rel = getRelative3D(star.x, star.y, star.z);
        if (rel.z <= 10) return;
        
        const scale = CONFIG.fov / rel.z;
        const screenX = canvas.width / 2 + rel.x * scale;
        const screenY = canvas.height / 2 + rel.y * scale;
        
        if (screenX >= 0 && screenX < canvas.width && screenY >= 0 && screenY < canvas.height) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, (2000 - rel.z) / 1000) * 0.5})`;
            ctx.beginPath();
            ctx.arc(screenX, screenY, star.size * scale * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    // Dibujar cuadrícula tenue
    drawSpatialGrid();
    
    requestAnimationFrame(drawMenuBackground);
}
drawMenuBackground();

// --- MANEJO DE CONTROLES TÁCTILES MÓVILES ---
function updateMobileControlsVisibility() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const controls = document.getElementById('mobile-controls');
    if (!controls) return;
    
    if (isTouch && state.screenRotated && state.playing) {
        controls.classList.remove('hidden');
    } else {
        controls.classList.add('hidden');
    }
}

// Configurar controladores táctiles para acelerador y disparo
const throttleTrack = document.getElementById('throttle-container');
const throttleBar = document.getElementById('throttle-bar');
const throttleKnob = document.getElementById('throttle-knob');
let isAdjustingThrottle = false;

function handleThrottle(clientY) {
    if (!state.playing) return;
    const track = document.querySelector('.slider-track');
    const rect = track.getBoundingClientRect();
    
    let val = (rect.bottom - clientY) / rect.height;
    val = Math.max(0, Math.min(1, val));
    
    updateThrottleUI(val);
    sendThrottleToServer(val);
}

function updateThrottleUI(val) {
    const percentage = val * 100;
    if (throttleBar) throttleBar.style.height = `${percentage}%`;
    if (throttleKnob) throttleKnob.style.bottom = `calc(${percentage}% - 17px)`;
}

function sendThrottleToServer(val) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'throttle',
            value: val
        }));
    }
}

if (throttleTrack) {
    // Touch events para soporte móvil nativo multipunto
    throttleTrack.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        const touch = e.changedTouches[0];
        state.throttleTouchId = touch.identifier;
        isAdjustingThrottle = true;
        handleThrottle(touch.clientY);
    }, { passive: true });
    
    window.addEventListener('touchmove', (e) => {
        if (isAdjustingThrottle) {
            let throttleTouch = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === state.throttleTouchId) {
                    throttleTouch = e.touches[i];
                    break;
                }
            }
            if (throttleTouch) {
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                handleThrottle(throttleTouch.clientY);
            }
        }
    }, { passive: false });
    
    window.addEventListener('touchend', (e) => {
        if (isAdjustingThrottle) {
            let finished = true;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === state.throttleTouchId) {
                    finished = false;
                    break;
                }
            }
            if (finished) {
                isAdjustingThrottle = false;
            }
        }
    }, { passive: true });

    // Pointer events como soporte secundario (ratón / escritorio)
    throttleTrack.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        e.stopPropagation();
        isAdjustingThrottle = true;
        handleThrottle(e.clientY);
    });
    
    window.addEventListener('pointermove', (e) => {
        if (isAdjustingThrottle && e.pointerType !== 'touch') {
            e.stopPropagation();
            handleThrottle(e.clientY);
        }
    });
    
    window.addEventListener('pointerup', (e) => {
        if (isAdjustingThrottle && e.pointerType !== 'touch') {
            isAdjustingThrottle = false;
        }
    });
}

const fireButton = document.getElementById('fire-button');
if (fireButton) {
    const triggerFire = (e) => {
        e.stopPropagation();
        e.preventDefault();
        shoot(canvas.width / 2, canvas.height / 2);
    };
    fireButton.addEventListener('touchstart', triggerFire, { passive: false });
    fireButton.addEventListener('pointerdown', triggerFire);
}
