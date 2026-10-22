// comparar.js
// Prueba automática: levanta las dos implementaciones, genera los MISMOS cambios
// en ambas y mide solicitudes/mensajes, respuestas vacías y retraso.
// Uso: node comparar.js            (fase con cambios 60 s + fase sin cambios 30 s)
//      node comparar.js 30 15      (duraciones personalizadas en segundos)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');

const DUR_CAMBIOS = Number(process.argv[2] || 60) * 1000;
const DUR_SIN = Number(process.argv[3] || 30) * 1000;
const CADA = 10000;                         // un cambio cada 10 s
const INTERVALOS = [1000, 2000, 5000];      // intervalos de polling a comparar
const P_POLL = 4001, P_WS = 4002;           // puertos propios para no chocar con la demo
const espera = (ms) => new Promise(r => setTimeout(r, ms));

function levantar(script, puerto) {
    const hijo = spawn(process.execPath, [path.join(__dirname, script)], {
        env: { ...process.env, PORT: puerto }, stdio: 'ignore'
    });
    return hijo;
}

async function listo(url) {
    for (let i = 0; i < 50; i++) {
        try { await fetch(url); return; } catch { await espera(200); }
    }
    throw new Error('No arrancó ' + url);
}

// ---------- Cliente de polling (igual al del navegador) ----------
function clientePolling(intervalo) {
    const st = { nombre: `Polling ${intervalo / 1000} s`, fase: 'cambios',
                 cambios: { solicitudes: 0, con: 0, sin: 0, detectados: 0, retrasos: [], bytes: 0 },
                 sin: { solicitudes: 0, con: 0, sin: 0, detectados: 0, retrasos: [], bytes: 0 } };
    let version = 0; const vistos = {};
    const tick = async () => {
        const f = st[st.fase];
        f.solicitudes++;
        const r = await fetch(`http://localhost:${P_POLL}/api/pedidos?desde=${version}`);
        if (r.status === 204) { f.sin++; return; }
        const texto = await r.text(); f.bytes += Buffer.byteLength(texto); f.con++;
        const d = JSON.parse(texto); const ahora = Date.now();
        d.pedidos.forEach(p => {
            if (version !== 0 && vistos[p.id] !== p.actualizadoEn) {
                f.detectados++; f.retrasos.push(ahora - p.actualizadoEn);
            }
            vistos[p.id] = p.actualizadoEn;
        });
        version = d.version;
    };
    tick();
    st.timer = setInterval(tick, intervalo);
    return st;
}

// ---------- Cliente WebSocket ----------
function clienteWS() {
    const st = { nombre: 'WebSocket', fase: 'cambios',
                 cambios: { mensajes: 0, detectados: 0, retrasos: [], bytes: 0, control: 0 },
                 sin: { mensajes: 0, detectados: 0, retrasos: [], bytes: 0, control: 0 } };
    const s = io(`http://localhost:${P_WS}`, { transports: ['websocket'] });
    s.on('pedidos:inicial', (d) => { st[st.fase].mensajes++; st[st.fase].bytes += JSON.stringify(d).length; });
    s.on('pedido:actualizado', (d) => {
        const f = st[st.fase];
        f.mensajes++; f.detectados++; f.retrasos.push(Date.now() - d.pedido.actualizadoEn);
        f.bytes += JSON.stringify(d).length;
    });
    s.io.on('open', () => {
        // ping/pong de Socket.IO para mantener viva la conexión (mensajes de control)
        s.io.engine.on('packet', (p) => { if (p.type === 'ping') st[st.fase].control++; });
    });
    st.socket = s;
    return st;
}

const prom = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
const max = (a) => a.length ? Math.max(...a) : 0;

(async () => {
    console.log('Levantando servidores de prueba...');
    const hijos = [levantar('polling/server.js', P_POLL), levantar('websocket/server.js', P_WS)];
    try {
        await listo(`http://localhost:${P_POLL}/api/estados`);
        await listo(`http://localhost:${P_WS}/api/estados`);

        const clientes = INTERVALOS.map(clientePolling);
        const ws = clienteWS();
        await espera(1500);
        const t0 = Date.now();

        // FASE 1: un cambio cada 10 s, el MISMO pedido en ambos servidores
        console.log(`Fase 1: ${DUR_CAMBIOS / 1000} s con un cambio cada ${CADA / 1000} s...`);
        const ids = [101, 102, 103, 104, 105, 106];
        let i = 0;
        const cambiar = async () => {
            const id = ids[i++ % ids.length];
            await Promise.all([P_POLL, P_WS].map(p =>
                fetch(`http://localhost:${p}/api/pedidos/${id}`, { method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }, body: '{}' })));
        };
        // Se agrega un desfase aleatorio (0-2 s) para que los cambios no coincidan
        // siempre con el mismo momento del ciclo de polling (medición más realista)
        let activo = true, nCambios = 0;
        (async function bucle() {
            while (activo) {
                await espera(CADA + Math.random() * 2000);
                if (activo) { await cambiar(); nCambios++; }
            }
        })();
        await espera(DUR_CAMBIOS);
        activo = false;
        await espera(5500);                           // margen para que el polling de 5 s lo detecte

        // FASE 2: sin cambios
        console.log(`Fase 2: ${DUR_SIN / 1000} s SIN cambios...`);
        [...clientes, ws].forEach(c => c.fase = 'sin');
        await espera(DUR_SIN);

        clientes.forEach(c => clearInterval(c.timer));
        ws.socket.disconnect();

        // ---------- Resultados ----------
        const filas = [];
        clientes.forEach(c => {
            const a = c.cambios, b = c.sin;
            filas.push({
                Mecanismo: c.nombre,
                'F1 solicitudes': a.solicitudes, 'F1 con cambios': a.con, 'F1 vacías (204)': a.sin,
                'F1 % innecesarias': Math.round(a.sin * 100 / a.solicitudes) + ' %',
                'Cambios detectados': a.detectados, 'Retraso prom. (ms)': prom(a.retrasos),
                'Retraso máx. (ms)': max(a.retrasos), 'Bytes datos F1': a.bytes,
                'F2 solicitudes (sin cambios)': b.solicitudes
            });
        });
        const a = ws.cambios, b = ws.sin;
        filas.push({
            Mecanismo: 'WebSocket',
            'F1 solicitudes': `${a.mensajes} mensajes`, 'F1 con cambios': a.detectados, 'F1 vacías (204)': 0,
            'F1 % innecesarias': '0 %', 'Cambios detectados': a.detectados,
            'Retraso prom. (ms)': prom(a.retrasos), 'Retraso máx. (ms)': max(a.retrasos),
            'Bytes datos F1': a.bytes,
            'F2 solicitudes (sin cambios)': `${b.mensajes} mensajes (+${a.control + b.control} ping de control en total)`
        });

        console.log(`\nRESULTADOS (${new Date().toLocaleString('es-EC')}, Node ${process.version})`);
        console.log(`Fase 1: ${DUR_CAMBIOS / 1000} s, ${nCambios} cambios. Fase 2: ${DUR_SIN / 1000} s sin cambios.\n`);
        console.table(filas);
        const salida = { fecha: new Date().toISOString(), node: process.version,
                         faseCambiosSeg: DUR_CAMBIOS / 1000, faseSinCambiosSeg: DUR_SIN / 1000,
                         cambiosCadaSeg: CADA / 1000, cambiosRealizados: nCambios, resultados: filas };
        fs.writeFileSync(path.join(__dirname, 'resultados.json'), JSON.stringify(salida, null, 2));
        console.log('\nResultados guardados en resultados.json');
        console.log(`Duración total: ${Math.round((Date.now() - t0) / 1000)} s`);
    } finally {
        hijos.forEach(h => h.kill());
        process.exit(0);
    }
})();
