# 🎮 GyroStrike: Neon Sector

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)

**GyroStrike: Neon Sector** es un emocionante juego arcade multijugador cooperativo en tiempo real diseñado para navegadores web. Permite a múltiples jugadores conectar sus dispositivos móviles y utilizarlos como controladores físicos basados en movimiento (giroscopio) para apuntar y destruir oleadas de drones alienígenas invasores en una pantalla compartida.

---

## 🚀 Características Principales

- 📱 **Control por Movimiento Real**: Utiliza la API de giroscopio (`DeviceOrientation`) de tu dispositivo móvil para apuntar girando físicamente sobre ti mismo.
- 💻 **Modo Fallback Táctil**: Detección automática en dispositivos sin giroscopio o sin permisos, permitiendo apuntar deslizando el dedo por la pantalla.
- 🔄 **Sincronización Multijugador**: Basado en WebSockets en tiempo real (`ws`), lo que permite que múltiples jugadores compartan el mismo espacio de combate y cooperen para sobrevivir.
- 🛡️ **Estado Cooperativo**: Vida (Armor) y Escudos (Shield) compartidos. ¡Si la base cae, todos pierden!
- 🎨 **Estética Cyberpunk/Neón**: Interfaz de diagnóstico de sensores, efectos visuales de partículas dinámicas y un HUD de estilo retro-futurista adaptativo.

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

1. **Montar la Sala**: Abre el juego en una pantalla principal grande (como tu ordenador de sobremesa, portátil o Smart TV conectada) accediendo a `http://<IP_LOCAL_DE_TU_PC>:8088`.
2. **Conectar Mandos**: Desde tu móvil, conéctate a la **misma red WiFi** que el ordenador principal y abre el navegador web apuntando a la IP local de tu servidor (ej. `http://192.168.1.50:8088`).
3. **Calibrar**:
   - Sujeta tu móvil en posición vertical mirando hacia la pantalla principal.
   - Presiona **"INICIAR COMBATE"**. 
   - Si es necesario, concede permisos de sensores (en iOS/Safari se te solicitará permiso explícito de orientación).
   - Puedes presionar el botón de **Calibración** o el icono `🎯` en cualquier momento para restablecer tu punto central (mirada hacia el frente).
4. **Combate**:
   - **Gira sobre ti mismo** a la izquierda, derecha, arriba o abajo para apuntar con tu retícula de color.
   - **Toca la pantalla de tu móvil** para disparar ráfagas de láseres de neón.
   - *Cuidado con el calentamiento*: Si disparas demasiado rápido, tu arma sufrirá de **Overheat** y tendrás que esperar a que se enfríe.
   - **Modo Táctil**: Si no dispones de giroscopio en tu dispositivo, arrastra el dedo por la pantalla para mover la retícula.

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
