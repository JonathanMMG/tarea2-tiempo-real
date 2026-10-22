// polling/server.js
// Implementación 1: REST + Polling.
// El servidor solo responde cuando el cliente pregunta (modelo petición-respuesta).
const express = require('express');
const path = require('path');
const { ESTADOS, AlmacenPedidos } = require('../comun/pedidos');

const PORT = process.env.PORT || 3001;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../comun/public'))); // admin.html y estilos.css compartidos

const almacen = new AlmacenPedidos();
const stats = { solicitudes: 0, conCambios: 0, sinCambios: 0, bytesEnviados: 0 };
let simulacion = null;

const hora = () => new Date().toLocaleTimeString('es-EC', { hour12: false });

// GET /api/pedidos?desde=<version>
// Si el cliente ya tiene la última versión responde 204 (sin contenido).
app.get('/api/pedidos', (req, res) => {
    // El panel de administración consulta con ?admin=1 y no se cuenta en las métricas
    if (req.query.admin) return res.json(almacen.listar());
    stats.solicitudes++;
    const desde = Number(req.query.desde || 0);
    if (desde === almacen.version) {
        stats.sinCambios++;
        console.log(`[${hora()}] #${stats.solicitudes} GET /api/pedidos?desde=${desde} -> 204 sin cambios`);
        return res.status(204).end();
    }
    const cuerpo = JSON.stringify({ ...almacen.listar(), horaServidor: Date.now() });
    stats.conCambios++;
    stats.bytesEnviados += Buffer.byteLength(cuerpo);
    console.log(`[${hora()}] #${stats.solicitudes} GET /api/pedidos?desde=${desde} -> 200 version ${almacen.version} (${Buffer.byteLength(cuerpo)} bytes)`);
    res.type('json').send(cuerpo);
});

// PUT /api/pedidos/:id  { estado }  -> usado por el panel de administración
app.put('/api/pedidos/:id', (req, res) => {
    const r = almacen.actualizar(req.params.id, req.body && req.body.estado);
    if (!r) return res.status(400).json({ error: 'Pedido o estado inválido' });
    console.log(`[${hora()}] CAMBIO pedido ${r.pedido.id} -> ${r.pedido.estado} (version ${r.version})`);
    res.json(r);
});

app.get('/api/estados', (req, res) => res.json(ESTADOS));
app.get('/api/stats', (req, res) => res.json(stats));

app.post('/api/reiniciar', (req, res) => {
    Object.keys(stats).forEach(k => stats[k] = 0);
    res.json(almacen.reiniciar());
    console.log(`[${hora()}] Datos y contadores reiniciados`);
});

// Simulación: cambia un pedido al azar cada N segundos
app.post('/api/simulacion', (req, res) => {
    const segundos = Number(req.body && req.body.segundos) || 0;
    clearInterval(simulacion); simulacion = null;
    if (segundos > 0) {
        simulacion = setInterval(() => {
            const r = almacen.avanzarAleatorio();
            console.log(`[${hora()}] SIMULACION pedido ${r.pedido.id} -> ${r.pedido.estado} (version ${r.version})`);
        }, segundos * 1000);
    }
    res.json({ simulacion: segundos > 0 ? `cada ${segundos} s` : 'detenida' });
});

app.listen(PORT, () => {
    console.log(`Servidor REST + Polling activo en http://localhost:${PORT}`);
    console.log(`Panel de administración: http://localhost:${PORT}/admin.html`);
});
