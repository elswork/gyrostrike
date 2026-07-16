const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 80;

// --- HTTP SERVER (Servidor de archivos estáticos) ---
const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);
    
    // Evitar salir del directorio raíz
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        return res.end('Access Denied');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// --- WEBSOCKET SERVER (Juego en tiempo real) ---
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// --- ESTADO DEL JUEGO COMPARTIDO ---
const gameState = {
    players: new Map(), // id -> { id, color, yaw, pitch, score, lastActive, throttle }
    drones: [],         // array de drones
    shield: 100,
    armor: 100,
    wave: 1,
    killsInWave: 0,
    killsNeededForNextWave: 8,
    active: false,
    droneIdCounter: 0,
    planetX: 0,
    planetY: 0,
    planetZ: 3000,
    speed: 0
};


const COLORS = [
    '#00f0ff', // Cyan
    '#39ff14', // Verde Neón
    '#ff9900', // Naranja
    '#ffff00', // Amarillo
    '#ff007f', // Rosa
    '#b000ff'  // Violeta
];

let nextColorIndex = 0;

// --- FÍSICA Y SPAWN DE DRONES EN EL SERVIDOR ---

function spawnDrone() {
    if (!gameState.active || gameState.drones.length >= 3) return;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 250 + Math.random() * 350;
    const types = ['cube', 'octahedron', 'diamond'];
    
    gameState.droneIdCounter++;
    
    gameState.drones.push({
        id: gameState.droneIdCounter,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        z: 1800 + Math.random() * 200,
        type: types[Math.floor(Math.random() * types.length)],
        size: 35,
        speed: 4.5 + (gameState.wave * 0.4) + Math.random()
    });
}

function getRelativeCoordinates(drone, yaw, pitch) {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    let x1 = drone.x * cosY - drone.z * sinY;
    let z1 = drone.x * sinY + drone.z * cosY;
    
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    let y2 = drone.y * cosP - z1 * sinP;
    let z2 = drone.y * sinP + z1 * cosP;
    
    return { x: x1, y: y2, z: z2 };
}

function broadcast(message) {
    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Bucle de físicas del servidor (30Hz)
function serverPhysicsLoop() {
    if (!gameState.active) return;
    
    // 1. Calcular promedio de yaw, pitch y throttle de todos los jugadores
    let totalYaw = 0;
    let totalPitch = 0;
    let totalThrottle = 0;
    let playerCount = 0;
    
    gameState.players.forEach(p => {
        totalYaw += p.yaw || 0;
        totalPitch += p.pitch || 0;
        totalThrottle += p.throttle || 0;
        playerCount++;
    });
    
    const avgYaw = playerCount > 0 ? totalYaw / playerCount : 0;
    const avgPitch = playerCount > 0 ? totalPitch / playerCount : 0;
    const avgThrottle = playerCount > 0 ? totalThrottle / playerCount : 0;
    
    // Calcular velocidad de la nave (max velocidad = 180 m/s)
    const maxSpeed = 180;
    gameState.speed = avgThrottle * maxSpeed;
    
    // Calcular el vector de avance en 3D
    const dx = gameState.speed * Math.sin(avgYaw) * Math.cos(avgPitch) * 0.033;
    const dy = gameState.speed * Math.sin(avgPitch) * 0.033;
    const dz = gameState.speed * Math.cos(avgYaw) * Math.cos(avgPitch) * 0.033;
    
    // Actualizar posición del planeta objetivo (se desplaza al revés que el avance)
    gameState.planetX -= dx;
    gameState.planetY -= dy;
    gameState.planetZ -= dz;
    
    // Si llegamos al planeta objetivo (distancia 3D <= 400m)
    const planetDist = Math.sqrt(gameState.planetX * gameState.planetX + gameState.planetY * gameState.planetY + gameState.planetZ * gameState.planetZ);
    if (planetDist <= 400) {
        nextWave();
        return;
    }
    
    let damaged = false;
    // Mover drones
    for (let i = gameState.drones.length - 1; i >= 0; i--) {
        const d = gameState.drones[i];
        
        // El dron se mueve hacia el jugador + el efecto de la velocidad de la nave
        d.x -= dx;
        d.y -= dy;
        d.z -= (d.speed + dz / 0.033) * 0.033;
        
        // Impacto contra la base de los jugadores
        if (d.z <= 20) {
            gameState.drones.splice(i, 1);
            damaged = true;
            
            // Aplicar daño colectivo
            if (gameState.shield > 0) {
                gameState.shield = Math.max(0, gameState.shield - 25);
            } else {
                gameState.armor = Math.max(0, gameState.armor - 20);
                if (gameState.armor <= 0) {
                    // Fin del juego colectivo
                    gameState.active = false;
                    broadcast({ type: 'gameover', score: getTeamScore(), wave: gameState.wave });
                    gameState.drones = [];
                }
            }
        }
    }
    
    if (damaged) {
        broadcast({ 
            type: 'damage', 
            shield: gameState.shield, 
            armor: gameState.armor 
        });
    }
    
    // Broadcast de estado a todos los jugadores
    const playersList = Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        color: p.color,
        yaw: p.yaw,
        pitch: p.pitch,
        score: p.score,
        throttle: p.throttle
    }));
    
    broadcast({
        type: 'state',
        players: playersList,
        drones: gameState.drones,
        shield: gameState.shield,
        armor: gameState.armor,
        wave: gameState.wave,
        planetX: gameState.planetX,
        planetY: gameState.planetY,
        planetZ: gameState.planetZ,
        speed: gameState.speed
    });
}

function getTeamScore() {
    let total = 0;
    gameState.players.forEach(p => total += p.score);
    return total;
}

function nextWave() {
    gameState.wave++;
    gameState.killsInWave = 0;
    gameState.killsNeededForNextWave = 8 + gameState.wave * 3;
    gameState.shield = Math.min(100, gameState.shield + 25);
    
    // Reiniciar planeta objetivo para la nueva fase
    gameState.planetX = (Math.random() - 0.5) * 2000;
    gameState.planetY = (Math.random() - 0.5) * 1000;
    gameState.planetZ = 3000 + gameState.wave * 1000; // Más largo cada oleada
    gameState.speed = 0;
    // Resetear aceleración de los jugadores para que inicien parados la nueva fase
    gameState.players.forEach(p => p.throttle = 0);
    
    broadcast({
        type: 'waveStart',
        wave: gameState.wave,
        shield: gameState.shield,
        planetX: gameState.planetX,
        planetY: gameState.planetY,
        planetZ: gameState.planetZ
    });
}

// Spawner periódico (reducido a 5000ms e individual para menor congestión)
setInterval(() => {
    if (gameState.active) {
        spawnDrone();
    }
}, 5000);

// Bucle de físicas (33ms = 30fps aprox)
setInterval(serverPhysicsLoop, 33);

// Limpiador de jugadores inactivos (ping/timeout)
setInterval(() => {
    const now = Date.now();
    gameState.players.forEach((p, id) => {
        if (now - p.lastActive > 10000) { // 10 segundos inactivo
            console.log(`Jugador ${id} inactivo. Desconectando.`);
            gameState.players.delete(id);
            broadcast({ type: 'playerLeft', id: id });
            
            if (gameState.players.size === 0) {
                gameState.active = false;
                gameState.drones = [];
            }
        }
    });
}, 5000);

// --- CONTROL DE CONEXIONES WEBSOCKET ---

let playerIdCounter = 0;

wss.on('connection', (ws) => {
    playerIdCounter++;
    const myId = playerIdCounter;
    const myColor = COLORS[nextColorIndex];
    nextColorIndex = (nextColorIndex + 1) % COLORS.length;
    
    console.log(`Jugador ${myId} conectado.`);
    
    const playerState = {
        id: myId,
        color: myColor,
        yaw: 0,
        pitch: 0,
        score: 0,
        throttle: 0,
        lastActive: Date.now()
    };
    
    gameState.players.set(myId, playerState);
    
    // Activar juego si entra el primer jugador
    if (!gameState.active && gameState.players.size === 1) {
        gameState.active = true;
        gameState.shield = 100;
        gameState.armor = 100;
        gameState.wave = 1;
        gameState.killsInWave = 0;
        gameState.drones = [];
        gameState.planetX = (Math.random() - 0.5) * 1500;
        gameState.planetY = (Math.random() - 0.5) * 800;
        gameState.planetZ = 3000;
        gameState.speed = 0;
        spawnDrone();
    }
    
    // Enviar bienvenida al jugador
    ws.send(JSON.stringify({
        type: 'welcome',
        id: myId,
        color: myColor,
        wave: gameState.wave,
        shield: gameState.shield,
        armor: gameState.armor,
        planetX: gameState.planetX,
        planetY: gameState.planetY,
        planetZ: gameState.planetZ
    }));
    
    ws.on('message', (messageStr) => {
        try {
            const msg = JSON.parse(messageStr);
            playerState.lastActive = Date.now();
            
            if (msg.type === 'move') {
                playerState.yaw = msg.yaw;
                playerState.pitch = msg.pitch;
            }
            
            else if (msg.type === 'throttle') {
                playerState.throttle = msg.value;
            }
            
            else if (msg.type === 'shoot') {
                // Re-difundir disparo para pintar rayo láser en los demás clientes
                broadcast({
                    type: 'shoot',
                    playerId: myId,
                    yaw: msg.yaw,
                    pitch: msg.pitch
                });
                
                // Comprobar colisión en el servidor
                let hitIndex = -1;
                for (let i = gameState.drones.length - 1; i >= 0; i--) {
                    const drone = gameState.drones[i];
                    const rel = getRelativeCoordinates(drone, msg.yaw, msg.pitch);
                    
                    if (rel.z <= 20) continue;
                    
                    // Colisión simplificada: si la distancia transversal es menor al radio del dron
                    if (Math.hypot(rel.x, rel.y) < drone.size * 1.5) {
                        hitIndex = i;
                        break;
                    }
                }
                
                if (hitIndex !== -1) {
                    const hitDrone = gameState.drones[hitIndex];
                    playerState.score += 100;
                    gameState.killsInWave++;
                    
                    broadcast({
                        type: 'hit',
                        playerId: myId,
                        droneId: hitDrone.id,
                        x: hitDrone.x,
                        y: hitDrone.y,
                        z: hitDrone.z
                    });
                    
                    gameState.drones.splice(hitIndex, 1);
                    
                    if (gameState.killsInWave >= gameState.killsNeededForNextWave) {
                        nextWave();
                    }
                }
            }
        } catch (e) {
            console.error("Error al parsear mensaje de WS:", e);
        }
    });
    
    ws.on('close', () => {
        console.log(`Jugador ${myId} desconectado.`);
        gameState.players.delete(myId);
        broadcast({ type: 'playerLeft', id: myId });
        
        if (gameState.players.size === 0) {
            gameState.active = false;
            gameState.drones = [];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor GyroStrike ejecutándose en http://localhost:${PORT}`);
});
