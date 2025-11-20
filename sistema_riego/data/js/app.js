// ========== VARIABLES GLOBALES ==========
let datosActuales = {
    humedad: 0,
    temperatura: 0,
    bomba: false,
    alerta: false,
    ultimaAlerta: '',
    timestamp: ''
};

let configuracion = {
    umbralHumedadBaja: 30,
    umbralHumedadAlta: 70,
    intervaloRiego: 60,
    modoAutomatico: true,
    horaRiego1: '07:00',
    horaRiego2: '19:00'
};

let updateInterval = null;
const UPDATE_INTERVAL = 5000; // 5 segundos

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema de Riego Automatizado - Iniciando...');

    // Cargar configuración
    cargarConfiguracion();

    // Cargar datos iniciales
    actualizarDatos();

    // Cargar estadísticas
    cargarEstadisticas();

    // Iniciar actualización automática
    iniciarActualizacionAutomatica();

    // Configurar formulario
    configurarFormulario();

    console.log('Sistema iniciado correctamente');
});

// ========== ACTUALIZACIÓN DE DATOS ==========
function iniciarActualizacionAutomatica() {
    updateInterval = setInterval(() => {
        actualizarDatos();
        verificarAlertas();
    }, UPDATE_INTERVAL);
}

async function actualizarDatos() {
    try {
        const response = await fetch('/api/datos');

        if (!response.ok) {
            throw new Error('Error al obtener datos');
        }

        const datos = await response.json();
        datosActuales = datos;

        // Actualizar UI
        actualizarInterfaz();
        actualizarEstadoConexion(true);

    } catch (error) {
        console.error('Error al actualizar datos:', error);
        actualizarEstadoConexion(false);
    }
}

function actualizarInterfaz() {
    // Actualizar humedad
    document.getElementById('humedadValue').textContent = datosActuales.humedad.toFixed(1);
    document.getElementById('humedadProgress').style.width = datosActuales.humedad + '%';

    let humedadStatus = '';
    if (datosActuales.humedad < configuracion.umbralHumedadBaja) {
        humedadStatus = '⚠️ Muy bajo - Requiere riego';
        document.getElementById('humedadProgress').style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
    } else if (datosActuales.humedad < configuracion.umbralHumedadAlta) {
        humedadStatus = '✓ Nivel aceptable';
        document.getElementById('humedadProgress').style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
    } else {
        humedadStatus = '✓ Nivel óptimo';
        document.getElementById('humedadProgress').style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
    }
    document.getElementById('humedadStatus').textContent = humedadStatus;

    // Actualizar temperatura
    document.getElementById('temperaturaValue').textContent = datosActuales.temperatura.toFixed(1);
    const tempProgress = Math.min((datosActuales.temperatura / 50) * 100, 100);
    document.getElementById('temperaturaProgress').style.width = tempProgress + '%';

    let tempStatus = '';
    if (datosActuales.temperatura < 15) {
        tempStatus = '❄️ Fría';
    } else if (datosActuales.temperatura < 25) {
        tempStatus = '✓ Normal';
    } else if (datosActuales.temperatura < 35) {
        tempStatus = '☀️ Cálida';
    } else {
        tempStatus = '🔥 Muy caliente';
    }
    document.getElementById('temperaturaStatus').textContent = tempStatus;

    // Actualizar estado de bomba
    const pumpIcon = document.getElementById('pumpIcon');
    const pumpText = document.getElementById('pumpText');
    const toggleBtn = document.getElementById('togglePumpBtn');

    if (datosActuales.bomba) {
        pumpIcon.classList.add('active');
        pumpText.textContent = 'Activada';
        pumpText.style.color = '#2ecc71';
        toggleBtn.textContent = 'Desactivar Bomba';
        toggleBtn.classList.add('active');
    } else {
        pumpIcon.classList.remove('active');
        pumpText.textContent = 'Desactivada';
        pumpText.style.color = '#7f8c8d';
        toggleBtn.textContent = 'Activar Bomba';
        toggleBtn.classList.remove('active');
    }

    // Actualizar timestamp
    actualizarTimestamp();

    // Calcular próximo riego
    calcularProximoRiego();
}

function actualizarEstadoConexion(conectado) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (conectado) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Conectado';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Desconectado';
    }
}

function actualizarTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = timeString;
}

// ========== ALERTAS ==========
function verificarAlertas() {
    if (datosActuales.alerta && datosActuales.ultimaAlerta) {
        mostrarAlerta(datosActuales.ultimaAlerta, 'danger');
    }
}

function mostrarAlerta(mensaje, tipo = 'warning') {
    const alertContainer = document.getElementById('alertContainer');
    const alertMessage = document.getElementById('alertMessage');
    const alert = alertContainer.querySelector('.alert');

    alertMessage.textContent = mensaje;
    alert.className = 'alert ' + tipo;
    alertContainer.classList.remove('hidden');
}

function cerrarAlerta() {
    const alertContainer = document.getElementById('alertContainer');
    alertContainer.classList.add('hidden');
}

// ========== CONTROL DE BOMBA ==========
async function toggleBomba() {
    try {
        const nuevoEstado = !datosActuales.bomba;

        const response = await fetch('/api/bomba', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });

        if (!response.ok) {
            throw new Error('Error al controlar la bomba');
        }

        // Actualizar estado inmediatamente
        datosActuales.bomba = nuevoEstado;
        actualizarInterfaz();

        // Mostrar mensaje
        const mensaje = nuevoEstado ? 'Bomba activada correctamente' : 'Bomba desactivada correctamente';
        mostrarNotificacion(mensaje, 'success');

    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al controlar la bomba', 'error');
    }
}

// ========== CONFIGURACIÓN ==========
async function cargarConfiguracion() {
    try {
        const response = await fetch('/api/config');

        if (!response.ok) {
            throw new Error('Error al cargar configuración');
        }

        configuracion = await response.json();

        // Actualizar formulario
        document.getElementById('umbralBajo').value = configuracion.umbralHumedadBaja;
        document.getElementById('umbralAlto').value = configuracion.umbralHumedadAlta;
        document.getElementById('intervaloRiego').value = configuracion.intervaloRiego;
        document.getElementById('modoAutomatico').checked = configuracion.modoAutomatico;
        document.getElementById('horaRiego1').value = configuracion.horaRiego1;
        document.getElementById('horaRiego2').value = configuracion.horaRiego2;

        // Actualizar recordatorios
        document.getElementById('riego1Time').textContent = configuracion.horaRiego1;
        document.getElementById('riego2Time').textContent = configuracion.horaRiego2;

    } catch (error) {
        console.error('Error al cargar configuración:', error);
    }
}

function configurarFormulario() {
    const form = document.getElementById('configForm');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const nuevaConfig = {
            umbralHumedadBaja: parseInt(document.getElementById('umbralBajo').value),
            umbralHumedadAlta: parseInt(document.getElementById('umbralAlto').value),
            intervaloRiego: parseInt(document.getElementById('intervaloRiego').value),
            modoAutomatico: document.getElementById('modoAutomatico').checked,
            horaRiego1: document.getElementById('horaRiego1').value,
            horaRiego2: document.getElementById('horaRiego2').value
        };

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(nuevaConfig)
            });

            if (!response.ok) {
                throw new Error('Error al guardar configuración');
            }

            configuracion = nuevaConfig;

            // Actualizar recordatorios
            document.getElementById('riego1Time').textContent = configuracion.horaRiego1;
            document.getElementById('riego2Time').textContent = configuracion.horaRiego2;

            mostrarNotificacion('Configuración guardada correctamente', 'success');

        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('Error al guardar configuración', 'error');
        }
    });
}

// ========== ESTADÍSTICAS ==========
async function cargarEstadisticas() {
    try {
        const response = await fetch('/api/estadisticas');

        if (!response.ok) {
            throw new Error('Error al cargar estadísticas');
        }

        const stats = await response.json();

        // Actualizar UI
        document.getElementById('statHumedadProm').textContent = stats.humedadPromedio.toFixed(1) + '%';
        document.getElementById('statTempProm').textContent = stats.temperaturaPromedio.toFixed(1) + '°C';

        const minutos = Math.floor(stats.tiempoRiegoTotal / 60);
        const segundos = stats.tiempoRiegoTotal % 60;
        document.getElementById('statTiempoRiego').textContent = `${minutos}m ${segundos}s`;

        document.getElementById('statUsoAgua').textContent = stats.usoAguaEstimado.toFixed(1) + ' L';

    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// ========== DATOS HISTÓRICOS ==========
async function descargarDatos() {
    try {
        const response = await fetch('/api/historico');

        if (!response.ok) {
            throw new Error('No hay datos históricos disponibles');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'historico_riego_' + new Date().toISOString().split('T')[0] + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        mostrarNotificacion('Datos descargados correctamente', 'success');

    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al descargar datos', 'error');
    }
}

async function borrarHistorico() {
    if (!confirm('¿Estás seguro de que deseas borrar todo el histórico de datos? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const response = await fetch('/api/historico', {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Error al borrar histórico');
        }

        mostrarNotificacion('Histórico borrado correctamente', 'success');

        // Recargar estadísticas y gráficos
        cargarEstadisticas();
        if (typeof cargarDatosGraficos === 'function') {
            cargarDatosGraficos();
        }

    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al borrar histórico', 'error');
    }
}

// ========== UTILIDADES ==========
function calcularProximoRiego() {
    const ahora = new Date();
    const horaActual = ahora.getHours() * 60 + ahora.getMinutes();

    const [h1, m1] = configuracion.horaRiego1.split(':').map(Number);
    const [h2, m2] = configuracion.horaRiego2.split(':').map(Number);

    const minutos1 = h1 * 60 + m1;
    const minutos2 = h2 * 60 + m2;

    let proximoRiego = '';

    if (horaActual < minutos1) {
        proximoRiego = configuracion.horaRiego1;
    } else if (horaActual < minutos2) {
        proximoRiego = configuracion.horaRiego2;
    } else {
        proximoRiego = configuracion.horaRiego1 + ' (mañana)';
    }

    document.getElementById('proximoRiego').textContent = proximoRiego;
}

function mostrarNotificacion(mensaje, tipo) {
    // Crear notificación temporal
    const notification = document.createElement('div');
    notification.className = 'notification ' + tipo;
    notification.textContent = mensaje;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${tipo === 'success' ? '#2ecc71' : '#e74c3c'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Agregar estilos de animación para notificaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ========== LIMPIEZA ==========
window.addEventListener('beforeunload', function() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
