# TRAZO

<p align="center">
  <img src="./public/logo_login.webp" alt="Trazo" width="520" />
</p>

<p align="center">
  Una pizarra visual con IA para convertir bocetos y texto manuscrito en una version presentada dentro del propio canvas.
</p>

<p align="center">
  <a href="https://github.com/albertogalvez-dev/trazo"><strong>Repositorio</strong></a>
</p>

## Demo

La demo se esta terminando de desplegar en CubePath.

En cuanto el VPS quede configurado, este bloque se actualizara con la URL publica final.

- Demo: pendiente de publicacion
- Repositorio: [https://github.com/albertogalvez-dev/trazo](https://github.com/albertogalvez-dev/trazo)

## Descripcion

Trazo es un MVP centrado en una idea muy concreta: dibujar rapido, seleccionar una parte del canvas y pedir a la IA que la reinterprete como una pieza mas limpia, mas bonita y mas util.

No busca ser un chat tipo ChatGPT ni una herramienta de diagramas totalmente automatica. La propuesta de valor esta en mantener la velocidad del boceto libre y sumar una capa de reinterpretacion visual encima de Excalidraw.

## Que hace

- Canvas basado en Excalidraw
- Pantalla de entrada ligera con persistencia del nombre en `localStorage`
- Panel lateral de IA flotante y movible
- Seleccion real del canvas para limitar la accion de la IA
- Acciones simples: `Reinterpretar` y `Pintar`
- Campo `Matiz` para dar instrucciones breves
- Generacion de imagen final a partir del boceto seleccionado
- Reemplazo de la seleccion por la reinterpretacion visual dentro del canvas
- Tour guiado en espanol
- Modal de ayuda personalizado con enlaces a LinkedIn, GitHub y portfolio

## Enfoque del MVP

Trazo esta planteado como una herramienta de apoyo visual para:

- wireframes rapidos
- pantallas bocetadas a mano
- diagramas sencillos
- ideas esquematicas que necesitan una primera pasada estetica

La IA no intenta resolver todo el tablero a la vez. Solo trabaja sobre la seleccion activa para mantener el flujo simple y controlado.

## Stack

- React
- TypeScript
- Vite
- Excalidraw
- CSS normal
- Node.js para el proxy local
- Vertex AI Express Mode para la reinterpretacion por imagen

## Flujo de uso

1. Entras en Trazo y accedes al canvas.
2. Dibujas un boceto, texto a mano o una composicion simple.
3. Seleccionas la zona que quieres reinterpretar.
4. Opcionalmente anades un matiz corto.
5. Pulsas `Reinterpretar`.
6. Trazo captura la seleccion, la envia a la IA y reemplaza esa zona por una version visual mas cuidada.

## Capturas

Estas imagenes muestran la identidad actual del proyecto y se completaran con capturas finales del flujo desplegado en CubePath.

<p align="center">
  <img src="./public/logo_login.webp" alt="Pantalla de acceso de Trazo" width="700" />
</p>

<p align="center">
  <img src="./src/assets/hero.png" alt="Visual del proyecto Trazo" width="320" />
</p>

## Como ejecutar en local

### Requisitos

- Node.js 20+
- npm 10+

### Variables de entorno

Crea un archivo `.env.local` con:

```env
VERTEX_EXPRESS_API_KEY=tu_api_key
TRAZO_AI_MODEL=gemini-2.5-flash-image
PORT=8787
```

### Desarrollo

```bash
npm install
npm run dev
```

La app web corre con Vite y el backend local expone el endpoint `/api/ai/prepare`.

## Como he utilizado CubePath

Para esta hackathon he elegido CubePath como infraestructura principal del despliegue.

### Configuracion elegida

- Region: Barcelona, Spain
- Tipo: General Purpose
- Plan: `gp.micro`
- Sistema operativo: Ubuntu 24
- IP publica IPv4 activada

### Motivo de esta eleccion

- baja latencia para Espana
- coste contenido dentro del bono inicial de CubePath
- recursos suficientes para servir la app, el proxy Node y Nginx

### Estrategia de despliegue

Trazo se desplegara en un VPS de CubePath con esta estructura:

- `Nginx` como proxy inverso
- `Node.js` para servir el build y la ruta `/api/ai/prepare`
- `PM2` para mantener el proceso vivo
- repositorio publico en GitHub para clonar directamente en el servidor

### Pasos de despliegue previstos

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates gnupg build-essential nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
git clone https://github.com/albertogalvez-dev/trazo.git
cd trazo
npm ci
npm run build
pm2 start npm --name trazo -- start
```

Despues, `Nginx` se configura para servir la aplicacion hacia el puerto del proceso Node.

## Estado actual

Trazo esta en fase MVP.

Lo que ya esta implementado:

- entrada inicial
- canvas funcional
- panel de IA usable
- reinterpretacion sobre seleccion
- integracion con Vertex AI
- tour guiado
- ayuda personalizada

Lo que queda por rematar:

- cerrar el despliegue publico final en CubePath
- actualizar la URL de demo
- anadir capturas finales del producto ya desplegado

## Autor

Alberto Galvez

- LinkedIn: [https://www.linkedin.com/in/alberto-galvez-aguado/](https://www.linkedin.com/in/alberto-galvez-aguado/)
- GitHub: [https://github.com/albertogalvez-dev](https://github.com/albertogalvez-dev)
- Portfolio: [https://albertogalvez-dev.github.io/](https://albertogalvez-dev.github.io/)

## Hackathon CubePath 2026

Este proyecto se presenta a la Hackathon de CubePath organizada por midudev.

Referencias:

- Repositorio oficial: [https://github.com/midudev/hackaton-cubepath-2026](https://github.com/midudev/hackaton-cubepath-2026)
- Reglas: [https://github.com/midudev/hackaton-cubepath-2026#-reglas](https://github.com/midudev/hackaton-cubepath-2026#-reglas)
