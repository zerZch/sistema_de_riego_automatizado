// ========== VARIABLES GLOBALES ==========
let humedadChart = null;
let temperaturaChart = null;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', function() {
    inicializarGraficos();
    cargarDatosGraficos();

    // Actualizar gráficos cada minuto
    setInterval(cargarDatosGraficos, 60000);
});

// ========== CONFIGURACIÓN DE GRÁFICOS ==========
function inicializarGraficos() {
    // Configuración común para ambos gráficos
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: true,
                position: 'top',
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                cornerRadius: 8,
                titleFont: {
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    size: 13
                },
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        label += context.parsed.y.toFixed(1);
                        label += context.dataset.label.includes('Humedad') ? '%' : '°C';
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: 'Tiempo',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 0,
                    font: {
                        size: 10
                    }
                }
            },
            y: {
                display: true,
                beginAtZero: true,
                title: {
                    display: true,
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                ticks: {
                    font: {
                        size: 11
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };

    // Gráfico de Humedad
    const ctxHumedad = document.getElementById('humedadChart').getContext('2d');
    humedadChart = new Chart(ctxHumedad, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humedad del Suelo',
                data: [],
                borderColor: 'rgb(46, 204, 113)',
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: 'rgb(46, 204, 113)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: {
                        display: true,
                        text: 'Humedad (%)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    max: 100
                }
            }
        }
    });

    // Gráfico de Temperatura
    const ctxTemperatura = document.getElementById('temperaturaChart').getContext('2d');
    temperaturaChart = new Chart(ctxTemperatura, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperatura',
                data: [],
                borderColor: 'rgb(52, 152, 219)',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: 'rgb(52, 152, 219)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: {
                        display: true,
                        text: 'Temperatura (°C)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    max: 50
                }
            }
        }
    });
}

// ========== CARGA DE DATOS ==========
async function cargarDatosGraficos() {
    try {
        const response = await fetch('/api/historico');

        if (!response.ok) {
            console.log('No hay datos históricos disponibles');
            return;
        }

        const csvText = await response.text();
        const datos = procesarCSV(csvText);

        actualizarGraficos(datos);

    } catch (error) {
        console.error('Error al cargar datos para gráficos:', error);
    }
}

function procesarCSV(csvText) {
    const lineas = csvText.trim().split('\n');
    const datos = {
        timestamps: [],
        humedad: [],
        temperatura: []
    };

    // Saltar la primera línea (encabezados)
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;

        const campos = linea.split(',');

        if (campos.length >= 3) {
            // Formato: timestamp,humedad,temperatura,bomba,alerta
            const timestamp = campos[0];
            const humedad = parseFloat(campos[1]);
            const temperatura = parseFloat(campos[2]);

            if (!isNaN(humedad) && !isNaN(temperatura)) {
                // Formatear timestamp para mostrar solo hora:minuto
                const fecha = new Date(timestamp);
                const timeStr = fecha.toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                datos.timestamps.push(timeStr);
                datos.humedad.push(humedad);
                datos.temperatura.push(temperatura);
            }
        }
    }

    // Limitar a las últimas 100 lecturas (últimas 24h aprox)
    const MAX_PUNTOS = 100;
    if (datos.timestamps.length > MAX_PUNTOS) {
        const inicio = datos.timestamps.length - MAX_PUNTOS;
        datos.timestamps = datos.timestamps.slice(inicio);
        datos.humedad = datos.humedad.slice(inicio);
        datos.temperatura = datos.temperatura.slice(inicio);
    }

    return datos;
}

function actualizarGraficos(datos) {
    if (!humedadChart || !temperaturaChart) {
        console.error('Gráficos no inicializados');
        return;
    }

    // Actualizar gráfico de humedad
    humedadChart.data.labels = datos.timestamps;
    humedadChart.data.datasets[0].data = datos.humedad;
    humedadChart.update('none'); // 'none' para actualización sin animación

    // Actualizar gráfico de temperatura
    temperaturaChart.data.labels = datos.timestamps;
    temperaturaChart.data.datasets[0].data = datos.temperatura;
    temperaturaChart.update('none');

    console.log(`Gráficos actualizados con ${datos.timestamps.length} puntos`);
}

// ========== UTILIDADES ==========
function agregarPuntoGrafico(humedad, temperatura, timestamp) {
    if (!humedadChart || !temperaturaChart) return;

    const timeStr = new Date(timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Agregar nuevo punto
    humedadChart.data.labels.push(timeStr);
    humedadChart.data.datasets[0].data.push(humedad);

    temperaturaChart.data.labels.push(timeStr);
    temperaturaChart.data.datasets[0].data.push(temperatura);

    // Limitar cantidad de puntos
    const MAX_PUNTOS = 100;
    if (humedadChart.data.labels.length > MAX_PUNTOS) {
        humedadChart.data.labels.shift();
        humedadChart.data.datasets[0].data.shift();
        temperaturaChart.data.labels.shift();
        temperaturaChart.data.datasets[0].data.shift();
    }

    // Actualizar gráficos
    humedadChart.update();
    temperaturaChart.update();
}

function limpiarGraficos() {
    if (humedadChart) {
        humedadChart.data.labels = [];
        humedadChart.data.datasets[0].data = [];
        humedadChart.update();
    }

    if (temperaturaChart) {
        temperaturaChart.data.labels = [];
        temperaturaChart.data.datasets[0].data = [];
        temperaturaChart.update();
    }
}

// ========== EXPORTAR FUNCIONES ==========
window.cargarDatosGraficos = cargarDatosGraficos;
window.agregarPuntoGrafico = agregarPuntoGrafico;
window.limpiarGraficos = limpiarGraficos;
