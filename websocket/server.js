// websocket/server.js
// Implementación 2: WebSockets (Socket.IO forzado a transporte WebSocket).
// La conexión queda abierta y el servidor ENVÍA los cambios apenas ocurren.
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { ESTADOS, AlmacenPedidos } = require('../comun/pedidos');

const PORT = process.env.PORT || 3002;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../comun/public'))); // admin.html y estilos.css compartidos

const server = http.createServer(app);
// transports: ['websocket'] -> sin long-polling de respaldo, solo WebSocket
const io = new Server(server, { transports: ['websocket'] });

const almacen = new AlmacenPedidos();
const stats = { clientesConectados: 0, mensajesEnviados: 0, bytesEnviados: 0 };
let simulacion = null;

const hora = () => new Date().toLocaleTimeString('es-EC', { hour12: false });

// Envía un cambio a TODOS los clientes conectados (broadcast)
function difundir(r) {
    const cuerpo = { version: r.version, pedido: r.pedido, horaServidor: Date.now() };
    const n = io.engine.clientsCount;
    stats.mensajesEnviados += n;
    stats.bytesEnviados += Buffer.byteLength(JSON.stringify(cuerpo)) * n;
    io.emit('pedido:actualizado', cuerpo);
    console.log(`[${hora()}] EMIT pedido:actualizado pedido ${r.pedido.id} -> ${r.pedido.estado} (version ${r.version}) a ${n} cliente(s)`);
}

io.on('connection', (socket) => {
    stats.clientesConectados = io.engine.clientsCount;
    console.log(`[${hora()}] Cliente conectado ${socket.id} (transporte: ${socket.conn.transport.name}). Total: ${stats.clientesConectados}`);

    // Estado inicial solo para el cliente que se acaba de conectar
    socket.emit('pedidos:inicial', { ...almacen.listar(), horaServidor: Date.now() });
    stats.mensajesEnviados++;

    // El cliente también puede cambiar un pedido por el mismo canal
    socket.on('pedido:cambiar', ({ id, estado }) => {
        console.log(`[${hora()}] RECIBIDO pedido:cambiar ${id} desde ${socket.id}`);
        const r = almacen.actualizar(id, estado);
        if (r) difundir(r);
    });

    socket.on('disconnect', (motivo) => {
        stats.clientesConectados = io.engine.clientsCount;
        console.log(`[${hora()}] Cliente desconectado ${socket.id} (${motivo}). Total: ${stats.clientesConectados}`);
    });
});

// Mismas rutas de administración que la versión Polling (mismo origen de los cambios)
app.put('/api/pedidos/:id', (req, res) => {
    const r = almacen.actualizar(req.params.id, req.body && req.body.estado);
    if (!r) return res.status(400).json({ error: 'Pedido o estado inválido' });
    console.log(`[${hora()}] CAMBIO pedido ${r.pedido.id} -> ${r.pedido.estado} (version ${r.version})`);
    difundir(r);
    res.json(r);
});

app.get('/api/pedidos', (req, res) => res.json(almacen.listar()));
app.get('/api/estados', (req, res) => res.json(ESTADOS));
app.get('/api/stats', (req, res) => res.json(stats));

app.post('/api/reiniciar', (req, res) => {
    stats.mensajesEnviados = 0; stats.bytesEnviados = 0;
    const datos = almacen.reiniciar();
    io.emit('pedidos:inicial', { ...datos, horaServidor: Date.now() });
    res.json(datos);
    console.log(`[${hora()}] Datos y contadores reiniciados`);
});

app.post('/api/simulacion', (req, res) => {
    const segundos = Number(req.body && req.body.segundos) || 0;
    clearInterval(simulacion); simulacion = null;
    if (segundos > 0) {
        simulacion = setInterval(() => {
            const r = almacen.avanzarAleatorio();
            console.log(`[${hora()}] SIMULACION pedido ${r.pedido.id} -> ${r.pedido.estado} (version ${r.version})`);
            difundir(r);
        }, segundos * 1000);
    }
    res.json({ simulacion: segundos > 0 ? `cada ${segundos} s` : 'detenida' });
});

server.listen(PORT, () => {
    console.log(`Servidor WebSocket activo en http://localhost:${PORT}`);
    console.log(`Panel de administración: http://localhost:${PORT}/admin.html`);
});
