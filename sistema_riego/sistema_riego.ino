/*
 * Sistema de Monitoreo de Riego con ESP32
 * Autor: Sistema Automatizado
 * Fecha: 2025
 *
 * Descripción:
 * Sistema de monitoreo con sensores IoT, almacenamiento de datos históricos,
 * alertas automáticas y interfaz web responsive
 *
 * Librerías requeridas (instalar desde Arduino IDE):
 * - ESPAsyncWebServer by me-no-dev
 * - AsyncTCP by me-no-dev
 * - ArduinoJson by Benoit Blanchon
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>

// ========== CONFIGURACIÓN WiFi ==========
const char* ssid = "David";           // Cambiar por tu red WiFi
const char* password = "12345678";      // Cambiar por tu contraseña

// ========== CONFIGURACIÓN DE PINES ==========
#define PIN_HUMEDAD_SUELO 34      // Pin analógico para sensor de humedad del suelo
#define PIN_TEMPERATURA 26        // Pin analógico para sensor de temperatura (ej: LM35)

// ========== PARÁMETROS DEL SISTEMA ==========
#define UMBRAL_HUMEDAD_BAJA 30    // Porcentaje de humedad para activar alerta
#define UMBRAL_HUMEDAD_ALTA 70    // Porcentaje de humedad óptima
#define INTERVALO_LECTURA 5000    // Intervalo de lectura de sensores (ms)
#define MAX_REGISTROS_HISTORICOS 1000  // Máximo de registros en memoria

// ========== SERVIDOR WEB ==========
AsyncWebServer server(80);

// ========== VARIABLES GLOBALES ==========
float humedadSuelo = 0;
float temperatura = 0;
bool alertaActiva = false;
String ultimaAlerta = "";
unsigned long ultimaLectura = 0;
unsigned long ultimoStatusWiFi = 0;
int registrosGuardados = 0;
bool primeraLectura = true;

// Configuración del sistema
struct Config {
  int umbralHumedadBaja = 30;
  int umbralHumedadAlta = 70;
  String horaRiego1 = "07:00";
  String horaRiego2 = "19:00";
};

Config config;

// ========== PROTOTIPOS DE FUNCIONES ==========
void conectarWiFi();
void verificarConexionWiFi();
void configurarServidorWeb();
float leerHumedadSuelo();
float leerTemperatura();
void leerSensores();
void verificarAlertas();
void inicializarArchivoDatos();
void guardarDatosHistoricos();
void rotarArchivoDatos();
void registrarEvento(String evento);
void cargarConfiguracion();
void guardarConfiguracion();
StaticJsonDocument<500> calcularEstadisticas();
String obtenerTimestamp();

// ========== FUNCIONES DE INICIALIZACIÓN ==========

void setup() {
  Serial.begin(115200);

  // Inicializar LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("Error al montar LittleFS");
    return;
  }
  Serial.println("LittleFS montado correctamente");

  // Cargar configuración
  cargarConfiguracion();

  // Inicializar archivos de datos si no existen
  inicializarArchivoDatos();

  // Conectar a WiFi
  conectarWiFi();

  // Configurar servidor web
  configurarServidorWeb();

  // Iniciar servidor
  server.begin();
  Serial.println("Servidor web iniciado");

  // Configurar tiempo NTP
  configTime(0, 0, "pool.ntp.org");

  Serial.println("Sistema de monitoreo iniciado correctamente");
}

void conectarWiFi() {
  Serial.println();
  Serial.println("========================================");
  Serial.print("Conectando a WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("========================================");
    Serial.println("        WiFi CONECTADO!");
    Serial.println("========================================");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.println("========================================");
  } else {
    Serial.println("ERROR: No se pudo conectar al WiFi");
    Serial.println("Continuando sin WiFi...");
  }
}

void verificarConexionWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado. Reconectando...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);

    int intentos = 0;
    while (WiFi.status() != WL_CONNECTED && intentos < 10) {
      delay(500);
      intentos++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("Reconectado! IP: ");
      Serial.println(WiFi.localIP());
    }
  }
}

// ========== CONFIGURACIÓN DEL SERVIDOR WEB ==========

void configurarServidorWeb() {
  // Servir archivos estáticos desde LittleFS
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  // ===== ENDPOINTS API REST =====

  // GET /api/datos - Obtener datos actuales de sensores
  server.on("/api/datos", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<300> doc;
    doc["humedad"] = humedadSuelo;
    doc["temperatura"] = temperatura;
    doc["alerta"] = alertaActiva;
    doc["ultimaAlerta"] = ultimaAlerta;
    doc["timestamp"] = obtenerTimestamp();

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // GET /api/config - Obtener configuración actual
  server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<400> doc;
    doc["umbralHumedadBaja"] = config.umbralHumedadBaja;
    doc["umbralHumedadAlta"] = config.umbralHumedadAlta;
    doc["horaRiego1"] = config.horaRiego1;
    doc["horaRiego2"] = config.horaRiego2;

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // POST /api/config - Actualizar configuración
  server.on("/api/config", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
      StaticJsonDocument<400> doc;
      deserializeJson(doc, (const char*)data);

      if (doc.containsKey("umbralHumedadBaja")) config.umbralHumedadBaja = doc["umbralHumedadBaja"];
      if (doc.containsKey("umbralHumedadAlta")) config.umbralHumedadAlta = doc["umbralHumedadAlta"];
      if (doc.containsKey("horaRiego1")) config.horaRiego1 = doc["horaRiego1"].as<String>();
      if (doc.containsKey("horaRiego2")) config.horaRiego2 = doc["horaRiego2"].as<String>();

      guardarConfiguracion();
      request->send(200, "application/json", "{\"status\":\"ok\"}");
    });

  // GET /api/historico - Obtener datos históricos
  server.on("/api/historico", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (LittleFS.exists("/data/historico.csv")) {
      request->send(LittleFS, "/data/historico.csv", "text/csv");
    } else {
      request->send(404, "application/json", "{\"error\":\"No hay datos históricos\"}");
    }
  });

  // GET /api/estadisticas - Obtener estadísticas del sistema
  server.on("/api/estadisticas", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<500> doc = calcularEstadisticas();

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // DELETE /api/historico - Borrar datos históricos
  server.on("/api/historico", HTTP_DELETE, [](AsyncWebServerRequest *request) {
    if (LittleFS.exists("/data/historico.csv")) {
      LittleFS.remove("/data/historico.csv");
      inicializarArchivoDatos();
      registrosGuardados = 0;
    }
    request->send(200, "application/json", "{\"status\":\"ok\"}");
  });

  // GET /api/alertas - Obtener alertas activas
  server.on("/api/alertas", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<300> doc;
    doc["alerta"] = alertaActiva;
    doc["mensaje"] = ultimaAlerta;
    doc["timestamp"] = obtenerTimestamp();

    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });
}

// ========== FUNCIONES DE SENSORES ==========

float leerHumedadSuelo() {
  // Leer sensor analógico (0-4095 en ESP32)
  int valorAnalogico = analogRead(PIN_HUMEDAD_SUELO);

  // Convertir a porcentaje (ajustar según calibración de tu sensor)
  // Valores típicos: 0 (muy seco) - 4095 (muy húmedo)
  float porcentaje = map(valorAnalogico, 0, 4095, 0, 100);

  // Invertir si el sensor mide resistencia (mayor valor = más seco)
  // porcentaje = 100 - porcentaje;

  return porcentaje;
}

float leerTemperatura() {
  // Leer sensor analógico
  int valorAnalogico = analogRead(PIN_TEMPERATURA);

  // Para sensor LM35: 10mV por grado Celsius
  // Voltaje = (valorAnalogico / 4095.0) * 3.3V
  // Temperatura = Voltaje * 100
  float temperatura = (valorAnalogico / 4095.0) * 3.3 * 100.0;

  return temperatura;
}

void leerSensores() {
  float humedadAnterior = humedadSuelo;
  float temperaturaAnterior = temperatura;

  humedadSuelo = leerHumedadSuelo();
  temperatura = leerTemperatura();

  // Solo imprimir si es la primera lectura o si hay cambio significativo (>1%)
  if (primeraLectura ||
      abs(humedadSuelo - humedadAnterior) > 1.0 ||
      abs(temperatura - temperaturaAnterior) > 0.5) {

    Serial.printf("Humedad: %.1f%% | Temperatura: %.1f°C\n", humedadSuelo, temperatura);
    primeraLectura = false;
  }

  // Verificar alertas
  verificarAlertas();

  // Guardar datos históricos
  guardarDatosHistoricos();
}

// ========== SISTEMA DE ALERTAS ==========

void verificarAlertas() {
  if (humedadSuelo < UMBRAL_HUMEDAD_BAJA) {
    if (!alertaActiva) {
      alertaActiva = true;
      ultimaAlerta = "¡Alerta! Humedad del suelo muy baja: " + String(humedadSuelo, 1) + "%";
      Serial.println(ultimaAlerta);
    }
  } else {
    if (alertaActiva) {
      alertaActiva = false;
      ultimaAlerta = "";
    }
  }
}

// ========== ALMACENAMIENTO DE DATOS ==========

void inicializarArchivoDatos() {
  if (!LittleFS.exists("/data/historico.csv")) {
    File file = LittleFS.open("/data/historico.csv", "w");
    if (file) {
      file.println("timestamp,humedad,temperatura,alerta");
      file.close();
      Serial.println("Archivo histórico creado");
    }
  }
}

void guardarDatosHistoricos() {
  if (registrosGuardados >= MAX_REGISTROS_HISTORICOS) {
    // Rotar archivo: eliminar registros antiguos
    rotarArchivoDatos();
  }

  File file = LittleFS.open("/data/historico.csv", "a");
  if (file) {
    String linea = obtenerTimestamp() + "," +
                   String(humedadSuelo, 1) + "," +
                   String(temperatura, 1) + "," +
                   String(alertaActiva ? 1 : 0);
    file.println(linea);
    file.close();
    registrosGuardados++;
  }
}

void rotarArchivoDatos() {
  // Leer últimos 500 registros y crear nuevo archivo
  File fileOld = LittleFS.open("/data/historico.csv", "r");
  File fileNew = LittleFS.open("/data/historico_temp.csv", "w");

  if (fileOld && fileNew) {
    String header = fileOld.readStringUntil('\n');
    fileNew.println(header);

    // Contar líneas
    int totalLineas = 0;
    while (fileOld.available()) {
      fileOld.readStringUntil('\n');
      totalLineas++;
    }

    // Volver al inicio (después del header)
    fileOld.seek(header.length() + 1);

    // Saltar líneas antiguas
    int lineasASaltar = totalLineas - 500;
    for (int i = 0; i < lineasASaltar && fileOld.available(); i++) {
      fileOld.readStringUntil('\n');
    }

    // Copiar últimas 500 líneas
    while (fileOld.available()) {
      String linea = fileOld.readStringUntil('\n');
      fileNew.println(linea);
    }

    fileOld.close();
    fileNew.close();

    LittleFS.remove("/data/historico.csv");
    LittleFS.rename("/data/historico_temp.csv", "/data/historico.csv");

    registrosGuardados = 500;
    Serial.println("Archivo histórico rotado");
  }
}

void registrarEvento(String evento) {
  File file = LittleFS.open("/data/eventos.txt", "a");
  if (file) {
    file.printf("[%s] %s\n", obtenerTimestamp().c_str(), evento.c_str());
    file.close();
  }
}

// ========== CONFIGURACIÓN ==========

void cargarConfiguracion() {
  if (LittleFS.exists("/config/settings.json")) {
    File file = LittleFS.open("/config/settings.json", "r");
    if (file) {
      StaticJsonDocument<512> doc;
      deserializeJson(doc, file);

      config.umbralHumedadBaja = doc["umbralHumedadBaja"] | 30;
      config.umbralHumedadAlta = doc["umbralHumedadAlta"] | 70;
      config.horaRiego1 = doc["horaRiego1"] | "07:00";
      config.horaRiego2 = doc["horaRiego2"] | "19:00";

      file.close();
      Serial.println("Configuración cargada");
    }
  } else {
    guardarConfiguracion();  // Crear archivo con valores por defecto
  }
}

void guardarConfiguracion() {
  File file = LittleFS.open("/config/settings.json", "w");
  if (file) {
    StaticJsonDocument<512> doc;
    doc["umbralHumedadBaja"] = config.umbralHumedadBaja;
    doc["umbralHumedadAlta"] = config.umbralHumedadAlta;
    doc["horaRiego1"] = config.horaRiego1;
    doc["horaRiego2"] = config.horaRiego2;

    serializeJson(doc, file);
    file.close();
    Serial.println("Configuración guardada");
  }
}

// ========== ESTADÍSTICAS ==========

StaticJsonDocument<500> calcularEstadisticas() {
  StaticJsonDocument<500> doc;

  float humedadPromedio = 0;
  float temperaturaPromedio = 0;
  int totalRegistros = 0;

  if (LittleFS.exists("/data/historico.csv")) {
    File file = LittleFS.open("/data/historico.csv", "r");
    if (file) {
      file.readStringUntil('\n');  // Saltar header

      while (file.available()) {
        String linea = file.readStringUntil('\n');
        int idx1 = linea.indexOf(',');
        int idx2 = linea.indexOf(',', idx1 + 1);
        int idx3 = linea.indexOf(',', idx2 + 1);

        if (idx1 > 0 && idx2 > 0 && idx3 > 0) {
          float h = linea.substring(idx1 + 1, idx2).toFloat();
          float t = linea.substring(idx2 + 1, idx3).toFloat();

          humedadPromedio += h;
          temperaturaPromedio += t;
          totalRegistros++;
        }
      }
      file.close();

      if (totalRegistros > 0) {
        humedadPromedio /= totalRegistros;
        temperaturaPromedio /= totalRegistros;
      }
    }
  }

  doc["humedadPromedio"] = humedadPromedio;
  doc["temperaturaPromedio"] = temperaturaPromedio;
  doc["totalRegistros"] = totalRegistros;

  return doc;
}

// ========== UTILIDADES ==========

String obtenerTimestamp() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", timeinfo);

  return String(buffer);
}

// ========== LOOP PRINCIPAL ==========

void loop() {
  unsigned long ahora = millis();

  // Leer sensores cada INTERVALO_LECTURA
  if (ahora - ultimaLectura >= INTERVALO_LECTURA) {
    ultimaLectura = ahora;
    leerSensores();
  }

  // Verificar conexión WiFi cada 30 segundos
  if (ahora - ultimoStatusWiFi >= 30000) {
    ultimoStatusWiFi = ahora;
    verificarConexionWiFi();
  }

  // yield() permite que el ESP32 maneje tareas internas sin bloquear
  yield();
}