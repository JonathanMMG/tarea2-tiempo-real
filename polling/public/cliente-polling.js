// polling/public/cliente-polling.js
// El cliente consulta periódicamente al servidor con fetch (HTTP GET).

let version = 0;                 // última versión que tiene este cliente
let temporizador = null;         // setInterval del polling
const vistos = {};               // id -> actualizadoEn ya mostrado
const m = { solicitudes: 0, con: 0, sin: 0, cambios: 0, sumaRetraso: 0, bytes: 0 };

const $ = (id) => document.getElementById(id);

function log(texto, clase = '') {
    const div = document.createElement('div');
    div.className = clase;
    div.textContent = `[${new Date().toLocaleTimeString('es-EC', { hour12: false })}] ${texto}`;
    $('log').prepend(div);
    while ($('log').children.length > 80) $('log').lastChild.remove();
}

function pintarMetricas() {
    $('mSolicitudes').textContent = m.solicitudes;
    $('mCon').textContent = m.con;
    $('mSin').textContent = m.sin;
    $('mInnecesarias').textContent = m.solicitudes ? Math.round(m.sin * 100 / m.solicitudes) + ' %' : '0 %';
    $('mCambios').textContent = m.cambios;
    $('mPromedio').textContent = m.cambios ? Math.round(m.sumaRetraso / m.cambios) + ' ms' : '-';
    $('mBytes').textContent = m.bytes;
}

function pintarTabla(pedidos, cambiados) {
    $('tabla').innerHTML = pedidos.map(p => `
        <tr class="${cambiados.includes(p.id) ? 'cambio' : ''}">
            <td>#${p.id}</td><td>${p.cliente}</td><td>${p.producto}</td>
            <td><span class="estado e-${p.estado.replace(/ /g, '-')}">${p.estado}</span></td>
            <td>${new Date(p.actualizadoEn).toLocaleTimeString('es-EC', { hour12: false })}</td>
        </tr>`).join('');
}

async function consultar() {
    m.solicitudes++;
    const inicio = performance.now();
    try {
        const r = await fetch(`/api/pedidos?desde=${version}`);
        const ms = Math.round(performance.now() - inicio);

        if (r.status === 204) {                         // no hay información nueva
            m.sin++;
            log(`GET /api/pedidos?desde=${version} -> 204 sin cambios (${ms} ms)`, 'vacio');
        } else {
            const texto = await r.text();
            m.bytes += texto.length;
            const datos = JSON.parse(texto);
            m.con++;
            const ahora = Date.now();
            const cambiados = [];
            datos.pedidos.forEach(p => {
                // Primera carga: solo se registra. Después: se mide el retraso del cambio.
                if (version !== 0 && vistos[p.id] !== p.actualizadoEn) {
                    const retraso = ahora - p.actualizadoEn;
                    m.cambios++; m.sumaRetraso += retraso;
                    $('mUltimo').textContent = retraso + ' ms';
                    cambiados.push(p.id);
                    log(`Pedido #${p.id} ahora "${p.estado}" (detectado ${retraso} ms después del cambio)`, 'dato');
                }
                vistos[p.id] = p.actualizadoEn;
            });
            log(`GET /api/pedidos?desde=${version} -> 200 version ${datos.version} (${texto.length} bytes, ${ms} ms)`, 'info');
            version = datos.version;
            pintarTabla(datos.pedidos, cambiados);
        }
    } catch (e) {
        log('Error de red: ' + e.message);
    }
    pintarMetricas();
}

function iniciar() {
    detener();
    const ms = Number($('intervalo').value);
    consultar();                                       // primera consulta inmediata
    temporizador = setInterval(consultar, ms);
    $('estadoPolling').textContent = `Consultando cada ${ms / 1000} s`;
    $('estadoPolling').className = 'conexion on';
    log(`Polling iniciado: una solicitud cada ${ms} ms`, 'info');
}

function detener() {
    if (temporizador) log('Polling detenido', 'info');
    clearInterval(temporizador); temporizador = null;
    $('estadoPolling').textContent = 'Detenido';
    $('estadoPolling').className = 'conexion off';
}

$('iniciar').onclick = iniciar;
$('detener').onclick = detener;
$('intervalo').onchange = () => { if (temporizador) iniciar(); };
iniciar();
