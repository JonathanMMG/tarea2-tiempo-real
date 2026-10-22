// websocket/public/cliente-ws.js
// El cliente abre UNA conexión WebSocket y espera los eventos del servidor.

// transports: ['websocket'] -> la conexión inicia directamente con el handshake WebSocket
const socket = io({ transports: ['websocket'], autoConnect: false });

let pedidos = [];
const m = { conexiones: 0, recibidos: 0, cambios: 0, sumaRetraso: 0, bytes: 0 };
const $ = (id) => document.getElementById(id);

function log(texto, clase = '') {
    const div = document.createElement('div');
    div.className = clase;
    div.textContent = `[${new Date().toLocaleTimeString('es-EC', { hour12: false })}] ${texto}`;
    $('log').prepend(div);
    while ($('log').children.length > 80) $('log').lastChild.remove();
}

function pintarMetricas() {
    $('mConexiones').textContent = m.conexiones;
    $('mRecibidos').textContent = m.recibidos;
    $('mCambios').textContent = m.cambios;
    $('mPromedio').textContent = m.cambios ? Math.round(m.sumaRetraso / m.cambios) + ' ms' : '-';
    $('mBytes').textContent = m.bytes;
}

function pintarTabla(cambiado) {
    $('tabla').innerHTML = pedidos.map(p => `
        <tr class="${p.id === cambiado ? 'cambio' : ''}">
            <td>#${p.id}</td><td>${p.cliente}</td><td>${p.producto}</td>
            <td><span class="estado e-${p.estado.replace(/ /g, '-')}">${p.estado}</span></td>
            <td>${new Date(p.actualizadoEn).toLocaleTimeString('es-EC', { hour12: false })}</td>
        </tr>`).join('');
}

socket.on('connect', () => {
    m.conexiones++;
    $('estadoConexion').textContent = 'Conectado';
    $('estadoConexion').className = 'conexion on';
    $('transporte').textContent = `(transporte: ${socket.io.engine.transport.name}, id ${socket.id})`;
    log(`Conexión WebSocket abierta (id ${socket.id})`, 'info');
    pintarMetricas();
});

socket.on('disconnect', (motivo) => {
    $('estadoConexion').textContent = 'Desconectado';
    $('estadoConexion').className = 'conexion off';
    $('transporte').textContent = '';
    log(`Conexión cerrada: ${motivo}`, 'vacio');
});

// Estado inicial: llega una sola vez al conectarse
socket.on('pedidos:inicial', (datos) => {
    m.recibidos++;
    m.bytes += JSON.stringify(datos).length;
    pedidos = datos.pedidos;
    log(`<- pedidos:inicial version ${datos.version} (${pedidos.length} pedidos)`, 'info');
    pintarTabla();
    pintarMetricas();
});

// Cambio enviado por el servidor (push), sin que el cliente lo pida
socket.on('pedido:actualizado', (datos) => {
    const retraso = Date.now() - datos.pedido.actualizadoEn;
    m.recibidos++; m.cambios++; m.sumaRetraso += retraso;
    m.bytes += JSON.stringify(datos).length;
    pedidos = pedidos.map(p => p.id === datos.pedido.id ? datos.pedido : p);
    $('mUltimo').textContent = retraso + ' ms';
    log(`<- pedido:actualizado #${datos.pedido.id} ahora "${datos.pedido.estado}" (version ${datos.version}, ${retraso} ms después del cambio)`, 'dato');
    pintarTabla(datos.pedido.id);
    pintarMetricas();
});

$('conectar').onclick = () => socket.connect();
$('desconectar').onclick = () => socket.disconnect();
socket.connect();
