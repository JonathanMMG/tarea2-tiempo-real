# Tarea 2 - Comunicación en tiempo real: REST + Polling vs WebSockets

Aplicaciones Distribuidas - ESPE (NRC 37869) - Jonathan Moreta

Escenario: **estado de pedidos** de un restaurante con entrega a domicilio. El restaurante cambia el estado de cada pedido (Recibido → En preparación → En camino → Entregado) y el cliente debe ver el cambio en su pantalla.

El mismo escenario y los mismos datos (`comun/pedidos.js`) se implementan dos veces:

| Carpeta | Mecanismo | Puerto |
|---|---|---|
| `polling/` | REST + Polling: el navegador pregunta con `GET /api/pedidos?desde=version` cada 1, 2, 5 o 10 s | 3001 |
| `websocket/` | WebSocket (Socket.IO forzado a transporte `websocket`): el servidor envía `pedido:actualizado` cuando hay un cambio | 3002 |

## Requisitos
- Node.js 18 o superior

## Instalación
```
npm install
```

## Ejecución
En dos terminales:
```
npm run polling      # http://localhost:3001  (admin: http://localhost:3001/admin.html)
npm run websocket    # http://localhost:3002  (admin: http://localhost:3002/admin.html)
```
Cada cliente muestra las solicitudes o mensajes intercambiados y las métricas (solicitudes, respuestas vacías, retraso, bytes). El panel de administración cambia estados manualmente o con una simulación automática.

## Comparación automática
```
npm run comparar     # 60 s con un cambio cada ~10 s + 30 s sin cambios
```
Levanta ambos servidores en los puertos 4001 y 4002, aplica los mismos cambios en los dos y compara polling a 1 s, 2 s y 5 s contra WebSocket. Guarda el resultado en `resultados.json`.

## Estructura
```
comun/pedidos.js            datos y lógica compartida
comun/public/admin.html     panel de administración (igual para ambos)
comun/public/estilos.css    estilos compartidos
polling/server.js           API REST (Express)
polling/public/             cliente que hace polling con fetch
websocket/server.js         servidor Express + Socket.IO
websocket/public/           cliente WebSocket
comparar.js                 prueba automática de ambos mecanismos
```
