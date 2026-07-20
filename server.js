const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 80;

// --- HTTP SERVER (Servidor de archivos estáticos) ---
const server = http.createServer((req, res) => {
    let cleanPath = '/index.html';
    try {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        cleanPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
    } catch(e) {
        cleanPath = req.url.split('?')[0];
        if (cleanPath === '/') cleanPath = '/index.html';
    }

    let filePath = path.join(__dirname, cleanPath);
    
    // Evitar salir del directorio raíz
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        return res.end('Access Denied');
    }

    const extname = path.extname(filePath).toLowerCase();
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
    motherships: [],    // Naves Nodriza Gigantes
    shield: 100,
    armor: 100,
    wave: 1,
    killsInWave: 0,
    killsNeededForNextWave: 8,
    active: false,
    droneIdCounter: 0,
    mothershipIdCounter: 0,
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

// --- FÍSICA Y SPAWN DE DRONES Y NAVES NODRIZA EN EL SERVIDOR ---

function spawnDrone() {
    const BASE_MAX_DRONES = 2;
    const MAX_DRONES_LIMIT = 5;
    const currentMaxDrones = Math.min(MAX_DRONES_LIMIT, BASE_MAX_DRONES + Math.floor((gameState.wave - 1) / 2));
    
    if (!gameState.active || gameState.drones.length >= currentMaxDrones) return;
    
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
        speed: 2.8 + (gameState.wave * 0.35) + (Math.random() * 0.5)
    });
}

function spawnMothership() {
    if (!gameState.active || gameState.motherships.length >= 1) return;
    
    gameState.mothershipIdCounter++;
    const angle = (Math.random() - 0.5) * Math.PI * 0.4;
    const shipType = (gameState.mothershipIdCounter % 2 === 1) ? 'enterprise' : 'star_destroyer';
    
    gameState.motherships.push({
        id: gameState.mothershipIdCounter,
        shipType: shipType,
        x: Math.sin(angle) * 250,
        y: (Math.random() - 0.5) * 150,
        z: 2200,
        size: 210,
        hp: 1400,
        maxHp: 1400,
        speed: 1.0,
        modules: [
            { id: 'gen_left', name: shipType === 'enterprise' ? 'Góndola Warp Izq' : 'Generador Escudo Izq', hp: 300, maxHp: 300, offsetX: -110, offsetY: 0, offsetZ: -20, destroyed: false },
            { id: 'gen_right', name: shipType === 'enterprise' ? 'Góndola Warp Der' : 'Generador Escudo Der', hp: 300, maxHp: 300, offsetX: 110, offsetY: 0, offsetZ: -20, destroyed: false },
            { id: 'bridge', name: shipType === 'enterprise' ? 'Puente Saucer (StarTrek)' : 'Torre Mando (StarWars)', hp: 400, maxHp: 400, offsetX: 0, offsetY: 45, offsetZ: 30, destroyed: false },
            { id: 'engine', name: shipType === 'enterprise' ? 'Núcleo Colector' : 'Reactor Iónico Triple', hp: 400, maxHp: 400, offsetX: 0, offsetY: -40, offsetZ: -70, destroyed: false }
        ],
        dockingPad: {
            offsetX: 0,
            offsetY: 35,
            offsetZ: 10,
            radius: 100
        }
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
    
    const maxSpeed = 180;
    gameState.speed = avgThrottle * maxSpeed;
    
    const dx = gameState.speed * Math.sin(avgYaw) * Math.cos(avgPitch) * 0.033;
    const dy = gameState.speed * Math.sin(avgPitch) * 0.033;
    const dz = gameState.speed * Math.cos(avgYaw) * Math.cos(avgPitch) * 0.033;
    
    gameState.planetX -= dx;
    gameState.planetY -= dy;
    gameState.planetZ -= dz;
    
    const planetDist = Math.sqrt(gameState.planetX * gameState.planetX + gameState.planetY * gameState.planetY + gameState.planetZ * gameState.planetZ);
    if (planetDist <= 400) {
        nextWave();
        return;
    }
    
    let damaged = false;
    
    // Mover Drones
    for (let i = gameState.drones.length - 1; i >= 0; i--) {
        const d = gameState.drones[i];
        d.x -= dx;
        d.y -= dy;
        d.z -= (d.speed + dz / 0.033) * 0.033;
        
        if (d.z <= 20) {
            gameState.drones.splice(i, 1);
            damaged = true;
            
            if (gameState.shield > 0) {
                gameState.shield = Math.max(0, gameState.shield - 25);
            } else {
                gameState.armor = Math.max(0, gameState.armor - 20);
                if (gameState.armor <= 0) {
                    gameState.active = false;
                    broadcast({ type: 'gameover', score: getTeamScore(), wave: gameState.wave });
                    gameState.drones = [];
                    gameState.motherships = [];
                }
            }
        }
    }
    
    // Mover Naves Nodriza
    for (let i = gameState.motherships.length - 1; i >= 0; i--) {
        const ms = gameState.motherships[i];
        ms.x -= dx;
        ms.y -= dy;
        ms.z -= (ms.speed + dz / 0.033) * 0.033;
        
        if (ms.z <= 40) {
            gameState.motherships.splice(i, 1);
            damaged = true;
            if (gameState.shield > 0) {
                gameState.shield = Math.max(0, gameState.shield - 35);
            } else {
                gameState.armor = Math.max(0, gameState.armor - 30);
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
        motherships: gameState.motherships,
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

// Spawner periódico de drones y naves nodriza
setInterval(() => {
    if (gameState.active) {
        spawnDrone();
        if (gameState.motherships.length === 0 && (gameState.wave >= 2 || Math.random() < 0.6)) {
            spawnMothership();
        }
    }
}, 4500);

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
                gameState.motherships = [];
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
        gameState.motherships = [];
        gameState.planetX = (Math.random() - 0.5) * 1500;
        gameState.planetY = (Math.random() - 0.5) * 800;
        gameState.planetZ = 3000;
        gameState.speed = 0;
        spawnDrone();
        spawnMothership();
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

            else if (msg.type === 'dock') {
                // El jugador solicita aterrizar en la plataforma de la Nave Nodriza
                gameState.shield = Math.min(100, gameState.shield + 40);
                gameState.armor = Math.min(100, gameState.armor + 30);
                playerState.score += 500;
                
                broadcast({
                    type: 'docked',
                    playerId: myId,
                    shield: gameState.shield,
                    armor: gameState.armor
                });
            }
            
            else if (msg.type === 'shoot') {
                // Re-difundir disparo para pintar rayo láser en los demás clientes
                broadcast({
                    type: 'shoot',
                    playerId: myId,
                    yaw: msg.yaw,
                    pitch: msg.pitch
                });
                
                // 1. Comprobar colisión con Módulos de Nave Nodriza
                let msHit = false;
                for (let i = gameState.motherships.length - 1; i >= 0; i--) {
                    const ms = gameState.motherships[i];
                    
                    for (let m of ms.modules) {
                        if (m.destroyed) continue;
                        const modPos = {
                            x: ms.x + m.offsetX,
                            y: ms.y + m.offsetY,
                            z: ms.z + m.offsetZ
                        };
                        const relMod = getRelativeCoordinates(modPos, msg.yaw, msg.pitch);
                        
                        if (relMod.z > 20 && Math.hypot(relMod.x, relMod.y) < 55) {
                            m.hp -= 90;
                            msHit = true;
                            playerState.score += 200;
                            
                            if (m.hp <= 0) {
                                m.destroyed = true;
                                m.hp = 0;
                                playerState.score += 600;
                                broadcast({
                                    type: 'moduleDestroyed',
                                    mothershipId: ms.id,
                                    moduleId: m.id,
                                    moduleName: m.name,
                                    x: modPos.x,
                                    y: modPos.y,
                                    z: modPos.z
                                });
                            } else {
                                broadcast({
                                    type: 'mothershipHit',
                                    mothershipId: ms.id,
                                    moduleId: m.id,
                                    hp: m.hp,
                                    maxHp: m.maxHp,
                                    x: modPos.x,
                                    y: modPos.y,
                                    z: modPos.z
                                });
                            }
                            break;
                        }
                    }
                    
                    if (msHit) break;
                    
                    // Colisión con casco principal de Nave Nodriza
                    const relMs = getRelativeCoordinates(ms, msg.yaw, msg.pitch);
                    if (relMs.z > 20 && Math.hypot(relMs.x, relMs.y) < ms.size * 1.3) {
                        ms.hp -= 75;
                        msHit = true;
                        playerState.score += 150;
                        
                        if (ms.hp <= 0) {
                            playerState.score += 2500;
                            gameState.killsInWave += 3;
                            broadcast({
                                type: 'mothershipDestroyed',
                                mothershipId: ms.id,
                                x: ms.x,
                                y: ms.y,
                                z: ms.z
                            });
                            gameState.motherships.splice(i, 1);
                        } else {
                            broadcast({
                                type: 'mothershipHit',
                                mothershipId: ms.id,
                                hp: ms.hp,
                                maxHp: ms.maxHp,
                                x: ms.x,
                                y: ms.y,
                                z: ms.z
                            });
                        }
                        break;
                    }
                }
                
                if (msHit) return;

                // 2. Comprobar colisión con Drones Estándar
                let hitIndex = -1;
                for (let i = gameState.drones.length - 1; i >= 0; i--) {
                    const drone = gameState.drones[i];
                    const rel = getRelativeCoordinates(drone, msg.yaw, msg.pitch);
                    
                    if (rel.z <= 20) continue;
                    
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
            gameState.motherships = [];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor GyroStrike ejecutándose en http://localhost:${PORT}`);
});
