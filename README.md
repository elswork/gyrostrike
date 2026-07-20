# 🎮 GyroStrike: Neon Sector

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)

**GyroStrike: Neon Sector** es un emocionante juego arcade multijugador cooperativo en tiempo real diseñado para navegadores web. Permite a múltiples jugadores conectar sus dispositivos móviles y utilizarlos como controladores físicos basados en movimiento (giroscopio) para apuntar y destruir oleadas de drones alienígenas invasores en una pantalla compartida.

---

## 🚀 Características Principales

- 💻 **Soporte Completo para PC (Teclado + Ratón)**: Jugable directamente desde ordenadores con apuntado por movimiento libre de ratón o captura Pointer Lock 360° estilo FPS, acelerador con `W/S` y disparo con `Clic/Espacio`.
- 📱 **Control por Movimiento Real**: Utiliza la API de giroscopio (`DeviceOrientation`) de tu dispositivo móvil para apuntar girando físicamente sobre ti mismo.
- 🔄 **Sincronización Multijugador**: Basado en WebSockets en tiempo real (`ws`), lo que permite que múltiples jugadores (PC y móviles) compartan el mismo espacio de combate y cooperen para sobrevivir.
- 🛡️ **Estado Cooperativo**: Vida (Armor) y Escudos (Shield) compartidos. ¡Si la base cae, todos pierden!
- 🎨 **Estética Cyberpunk/Neón**: Selector interactivo de controles, interfaz de diagnóstico de sensores, efectos visuales de partículas dinámicas y un HUD de estilo retro-futurista adaptativo.

---

## 🛠️ Arquitectura del Sistema

El servidor actúa como la autoridad centralizada, simulando la física de los drones, gestionando las oleadas y sincronizando el estado con todos los clientes a una frecuencia constante (30Hz).

```mermaid
graph TD
    subgraph Servidor (Node.js + WebSockets)
        S_HTTP[Servidor HTTP]
        S_WS[Servidor WebSocket]
        Loop[Bucle de Físicas 30Hz]
        State[Estado del Juego Cooperativo]
    end

    subgraph Dispositivos Clientes
        C1[Jugador 1: Móvil / PC]
        C2[Jugador 2: Móvil / PC]
        C3[Jugador N: Móvil / PC]
    end

    C1 <-->|WebSocket: Ángulo, Disparos| S_WS
    C2 <-->|WebSocket: Ángulo, Disparos| S_WS
    C3 <-->|WebSocket: Ángulo, Disparos| S_WS
    
    S_WS <-->|Actualizar Estado / Broadcast| State
    Loop <-->|Simular Drones / Daño| State
    S_HTTP -.->|Sirve index.html, app.js, style.css| C1
    S_HTTP -.->|Sirve index.html, app.js, style.css| C2
    S_HTTP -.->|Sirve index.html, app.js, style.css| C3
```

---

## 📦 Requisitos Previos

Necesitas tener instalado en tu máquina:
- **Node.js** (versión 18 o superior) y **npm**.
- *O alternativamente*, **Docker** y **Docker Compose** para un despliegue contenerizado.

---

## ⚙️ Instalación y Ejecución

### Opción A: Ejecución Local con Node.js

1. Clona el repositorio y entra en el directorio:
   ```bash
   git clone https://github.com/<tu-usuario>/gyrostrike.git
   cd gyrostrike
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia el servidor:
   ```bash
   npm start
   ```
   El servidor estará disponible en el puerto `80` (requiere permisos de administrador/root en algunos sistemas operacionales, ver nota abajo).

> [!NOTE]
> Si el puerto `80` está ocupado o necesitas ejecutar el servidor en un puerto sin privilegios con Node.js directamente, puedes cambiar la constante `PORT` en [server.js](file:///home/pirate/docker/gyrostrike/server.js#L6) (por ejemplo, a `3000` o `8080`).

---

### Opción B: Ejecución con Docker Compose (Recomendada)

La forma más rápida y limpia de ejecutar el juego sin preocuparse de los puertos o la versión local de Node.js:

1. Levanta los contenedores en segundo plano:
   ```bash
   docker-compose up -d --build
   ```

2. El juego se compilará y se expondrá en el puerto **`8088`** de tu host.
   - Accede localmente en: `http://localhost:8088`

3. Para detener el contenedor:
   ```bash
   docker-compose down
   ```

---

## 🎮 Cómo Jugar

### 💻 En PC (Teclado + Ratón):
1. **Accede al juego**: Abre `http://localhost:8088` (o la dirección del servidor).
2. **Selecciona el Modo PC**: El sistema detectará automáticamente tu ordenador y activará el modo PC.
3. **Controles**:
   - 🖱️ **Apuntado (Ratón)**: Mueve el ratón para apuntar tu retícula. Puedes activar la **Captura de Ratón 360° (Pointer Lock)** mediante la casilla inicial o la tecla `L`.
   - 💥 **Disparo**: Haz Clic Izquierdo, pulsa `ESPACIO` o la tecla `E`.
   - 🚀 **Acelerador (Thrust)**: Pulsa `W` (Aumentar) o `S` (Reducir) para controlar la velocidad de viaje hacia el planeta.
   - ⬆️⬇️ **Subir / Bajar (Pitch)**: Utiliza `Flecha Arriba` o `Flecha Abajo` para inclinar la nave verticalmente.
   - ⬅️➡️ **Girar (Yaw)**: `A` / `D` o `Flecha Izquierda` / `Flecha Derecha`.
   - 🎯 **Recalibrar / Centrar**: Pulsa la tecla `C` o `R` en cualquier momento.

### 📱 En Móvil (Giroscopio / Táctil):
1. **Conectar**: Conéctate a la misma red WiFi que el servidor y abre la dirección en el navegador móvil.
2. **Iniciar & Calibrar**: Sujeta tu teléfono mirando hacia el frente y pulsa **"INICIAR COMBATE"**.
3. **Controles**:
   - **Gira sobre ti mismo** a la izquierda, derecha, arriba o abajo para apuntar con tu giroscopio.
   - **Toca la pantalla** para disparar.
   - Si no dispones de giroscopio, puedes arrastrar el dedo por la pantalla (modo táctil).

---

## 🛠️ Tecnologías Utilizadas

- **Servidor:** Node.js, `ws` (WebSockets nativos de alto rendimiento).
- **Cliente:** Canvas HTML5 2D, JavaScript (Vanilla ES6), CSS3 moderno.
- **Contenerización:** Docker, Docker Compose (Alpine Node base).
- **Control Físico:** API de orientación del dispositivo HTML5 (`DeviceOrientationEvent`).

---

## 📂 Estructura de Archivos

- `server.js`: Lógica del servidor HTTP/WS, físicas del juego y sincronización colectiva.
- `app.js`: Renderizado del Canvas, control de partículas, gestores de eventos y calibración del giroscopio.
- `index.html` & `style.css`: Estructura y estilos de interfaz cyberpunk futurista con efecto de cristal (glassmorphism).
- `Dockerfile` & `docker-compose.yml`: Configuración de despliegue contenerizado.
- `package.json`: Definición de metadatos del proyecto y dependencias de Node.js.

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo `LICENSE` para más detalles (licenciado por defecto a la comunidad).
