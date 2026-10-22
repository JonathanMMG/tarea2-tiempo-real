// comun/pedidos.js
// Datos y lógica de negocio COMPARTIDOS por las dos implementaciones.
// Así REST + Polling y WebSocket manejan exactamente la misma información.

const ESTADOS = ['Recibido', 'En preparación', 'En camino', 'Entregado'];

function crearPedidos() {
    const clientes = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Pedro'];
    const productos = ['Pizza familiar', 'Hamburguesa doble', 'Ensalada César',
                       'Tacos x3', 'Sushi 12 piezas', 'Pollo asado'];
    return clientes.map((cliente, i) => ({
        id: 101 + i,
        cliente,
        producto: productos[i],
        estado: ESTADOS[0],
        actualizadoEn: Date.now()
    }));
}

class AlmacenPedidos {
    constructor() {
        this.pedidos = crearPedidos();
        this.version = 1;          // aumenta en cada cambio
    }

    listar() {
        return { version: this.version, pedidos: this.pedidos };
    }

    // Cambia el estado de un pedido. Si no se envía estado, avanza al siguiente.
    actualizar(id, estado) {
        const pedido = this.pedidos.find(p => p.id === Number(id));
        if (!pedido) return null;
        if (estado && !ESTADOS.includes(estado)) return null;
        const siguiente = ESTADOS[(ESTADOS.indexOf(pedido.estado) + 1) % ESTADOS.length];
        pedido.estado = estado || siguiente;
        pedido.actualizadoEn = Date.now();
        this.version++;
        return { version: this.version, pedido };
    }

    // Avanza un pedido al azar (usado por la simulación automática)
    avanzarAleatorio() {
        const p = this.pedidos[Math.floor(Math.random() * this.pedidos.length)];
        return this.actualizar(p.id);
    }

    reiniciar() {
        this.pedidos = crearPedidos();
        this.version++;
        return this.listar();
    }
}

module.exports = { ESTADOS, AlmacenPedidos };
