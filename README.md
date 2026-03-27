# TRAZO

<p align="center">
  <img src="./public/logo_login.webp" alt="Trazo" width="560" />
</p>

<p align="center">
  <strong>Whiteboard con IA para convertir bocetos y texto manuscrito en una version visual mas presentada sin salir del canvas.</strong>
</p>

<p align="center">
  <a href="http://194.26.100.74">Demo en vivo</a> |
  <a href="https://github.com/albertogalvez-dev/trazo">Repositorio</a> |
  <a href="https://www.linkedin.com/in/alberto-galvez-aguado/">Autor</a>
</p>

## Demo

- Demo publica en CubePath: [http://194.26.100.74](http://194.26.100.74)
- Repositorio publico: [https://github.com/albertogalvez-dev/trazo](https://github.com/albertogalvez-dev/trazo)

## Que es Trazo

Trazo es una pizarra web construida sobre Excalidraw con una capa de IA enfocada a una accion muy concreta: tomar un boceto ya dibujado y reinterpretarlo de forma mas limpia y mas visual dentro del propio lienzo.

La idea no es hablar con un chat ni pedir diagramas desde cero. La gracia esta en dibujar rapido, seleccionar solo la zona que te interesa y usar la IA como una herramienta de acabado visual.

## Que problema resuelve

Cuando dibujas una idea a mano alzada, el primer boceto sale rapido, pero la version que puedes ensenar suele requerir rehacerlo entero en otra herramienta. Ese salto rompe el ritmo.

Trazo intenta reducir esa friccion:

- mantienes la velocidad del boceto libre
- trabajas sobre una seleccion concreta
- obtienes una reinterpretacion mas presentada sin salir del canvas

## Como funciona

1. Entras en la app y accedes al canvas.
2. Dibujas un boceto, una interfaz simple o texto manuscrito.
3. Seleccionas la parte que quieres transformar.
4. Opcionalmente escribes un matiz corto para orientar el resultado.
5. Pulsas `Reinterpretar`.
6. Trazo captura esa zona, la envia al modelo de imagen y sustituye la seleccion por un resultado visual mas cuidado.

## Funcionalidades del MVP

- Pantalla de entrada con persistencia del nombre
- Canvas funcional con Excalidraw
- Panel de IA lateral flotante y arrastrable
- Deteccion real de seleccion
- Boton `Seleccionar todo`
- Acciones `Reinterpretar` y `Pintar`
- Campo `Matiz` para afinar la salida
- Reemplazo de la seleccion por la imagen generada
- Tour guiado en espanol
- Modal de ayuda personalizado con enlaces del autor

## Capturas reales

### Pantalla de entrada

![Pantalla de acceso de Trazo](./docs/screenshots/trazo-welcome.png)

### Canvas con panel de IA

![Canvas y panel de IA de Trazo](./docs/screenshots/trazo-workspace.png)

### Modal de ayuda personalizado

![Modal de ayuda de Trazo con enlaces del autor](./docs/screenshots/trazo-help.png)

## Stack

- React
- TypeScript
- Vite
- Excalidraw
- CSS normal
- Node.js
- Vertex AI Express Mode
- Nginx
- PM2

## Ejecucion local

### Requisitos

- Node.js 20 o superior
- npm 10 o superior

### Variables de entorno

Crea un archivo `.env.local`:

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

### Build y arranque local

```bash
npm run build
npm run start
```

## Despliegue en CubePath

Trazo esta desplegado en CubePath y la demo publica actual se sirve directamente desde la IP del VPS.

### Configuracion utilizada

- Region: Barcelona, Spain
- Tipo de instancia: General Purpose
- Plan: `gp.micro`
- Sistema operativo: Ubuntu 24
- IPv4 publica activada

### Por que esta configuracion

- mejor latencia para Espana
- coste ajustado al bono inicial de CubePath
- recursos suficientes para servir frontend, proxy y proceso Node sin sobredimensionar la maquina

### Arquitectura de despliegue

- `Nginx` expone la app en el puerto 80
- `Node.js` sirve el build y la ruta `/api/ai/prepare`
- `PM2` mantiene el proceso vivo
- `GitHub` se usa como origen del repositorio desplegado en el VPS

### Comandos principales usados en el servidor

```bash
apt update && apt upgrade -y
apt install -y git curl ca-certificates gnupg build-essential nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

cd /var/www
git clone https://github.com/albertogalvez-dev/trazo.git
cd trazo
npm ci
npm run build
pm2 start npm --name trazo -- start
pm2 save
```

### Proxy publico con Nginx

```nginx
server {
    listen 80;
    server_name 194.26.100.74 vps23488.cubepath.net;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Estado actual

El MVP ya permite completar el flujo principal de extremo a extremo:

- entrar
- dibujar
- seleccionar
- reinterpretar
- ver el resultado dentro del propio canvas

El punto a mejorar no es la base del producto, sino la calidad visual de algunas reinterpretaciones, especialmente cuando el boceto de partida es muy ambiguo.

## Autor

Alberto Galvez

- LinkedIn: [https://www.linkedin.com/in/alberto-galvez-aguado/](https://www.linkedin.com/in/alberto-galvez-aguado/)
- GitHub: [https://github.com/albertogalvez-dev](https://github.com/albertogalvez-dev)
- Portfolio: [https://albertogalvez-dev.github.io/](https://albertogalvez-dev.github.io/)

## Hackathon CubePath 2026

Proyecto presentado a la Hackathon de CubePath organizada por midudev.

- Repositorio oficial: [https://github.com/midudev/hackaton-cubepath-2026](https://github.com/midudev/hackaton-cubepath-2026)
- Reglas: [https://github.com/midudev/hackaton-cubepath-2026#-reglas](https://github.com/midudev/hackaton-cubepath-2026#-reglas)
