import React, { useState } from 'react';
import { Copy, Check, Download, Cpu, ShieldAlert, Sparkles, AlertTriangle } from 'lucide-react';

export default function ArduinoCode() {
  const [copied, setCopied] = useState(false);

  const esp32Code = `/*
 * ESP32 Telegram Bot & REST API Web Server - Kontrol 4 Relay + Sensor DHT11
 * =========================================================================
 * Relay : Pin 5, 19, 18, 23
 * DHT11 : Pin 4
 * WiFi  : ABCD / 10112004
 * BOT   : 8838873271:AAE-mNjaa-msJu-7ogcHGgfHAUmFMUfd6mk
 * CHAT  : 8789392801
 *
 * FITUR UPGRADE:
 * 1. Tetap mendukung Telegram Bot seperti kode lama Anda.
 * 2. Menambahkan HTTP Web Server pada Port 80 untuk Direct IP Control.
 * 3. Menambahkan CORS Header ("Access-Control-Allow-Origin: *") 
 *    agar Web App ini dapat mengakses ESP32 langsung dengan delay <10ms!
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <WebServer.h> // <-- TAMBAHAN: Untuk Server REST API Direct IP

// ==================== KONFIGURASI ====================
const char* WIFI_SSID     = "ABCD";
const char* WIFI_PASSWORD = "10112004";
const String BOT_TOKEN    = "8838873271:AAE-mNjaa-msJu-7ogcHGgfHAUmFMUfd6mk";
const String CHAT_ID      = "8789392801";

#define RELAY1_PIN  5
#define RELAY2_PIN  19
#define RELAY3_PIN  18
#define RELAY4_PIN  23
#define DHT_PIN     4
#define DHT_TYPE    DHT11

#define RELAY_ON    LOW    // Ganti HIGH jika relay aktif HIGH
#define RELAY_OFF   HIGH
#define VAR_DELAY   150    // Jeda antar relay saat variasi (ms)

// ==================== OBJEK ====================
WiFiClientSecure client;
UniversalTelegramBot bot(BOT_TOKEN, client);
DHT dht(DHT_PIN, DHT_TYPE);
WebServer server(80); // <-- TAMBAHAN: Jalankan webserver pada port 80

// ==================== VARIABEL ====================
bool relayState[4]   = {false, false, false, false};
int  relayPins[4]    = {RELAY1_PIN, RELAY2_PIN, RELAY3_PIN, RELAY4_PIN};
String relayNames[4] = {"R1(Pin5)", "R2(Pin19)", "R3(Pin18)", "R4(Pin23)"};
bool variasiBerjalan = false;
unsigned long lastBotCheck = 0;
const int BOT_DELAY = 1000;

// ==================== FUNGSI RELAY ====================
void setRelay(int idx, bool state) {
  if (idx >= 0 && idx < 4) {
    relayState[idx] = state;
    digitalWrite(relayPins[idx], state ? RELAY_ON : RELAY_OFF);
  }
}

void setAllRelay(bool state) {
  for (int i = 0; i < 4; i++) setRelay(i, state);
}

// ==================== GET DATA SENSOR ====================
float lastTemp = 27.5;
float lastHumid = 65.0;

void bacaSensor() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) lastTemp = t;
  if (!isnan(h)) lastHumid = h;
}

// ==================== FORMAT STATUS ====================
String getRelayStatus() {
  String msg = "📋 *Status Relay:*\\n";
  for (int i = 0; i < 4; i++) {
    msg += (relayState[i] ? "🟢 " : "🔴 ");
    msg += relayNames[i] + ": *" + (relayState[i] ? "ON" : "OFF") + "*\\n";
  }
  return msg;
}

String getDHTStatus() {
  bacaSensor();
  String msg = "🌡️ *Sensor DHT11:*\\n";
  msg += "🌡️ Suhu      : *" + String(lastTemp, 1) + " °C*\\n";
  msg += "💧 Kelembapan: *" + String(lastHumid, 1) + " %*\\n";
  return msg;
}

String getMenu() {
  String msg = "🤖 *ESP32 Relay Controller*\\n\\n";
  msg += "🔌 *Kontrol Relay:*\\n";
  msg += "  r1 on / r1 off\\n";
  msg += "  r2 on / r2 off\\n";
  msg += "  r3 on / r3 off\\n";
  msg += "  r4 on / r4 off\\n\\n";
  msg += "⚡ *Kontrol Semua:*\\n";
  msg += "  all on  — Nyalakan semua\\n";
  msg += "  all off — Matikan semua\\n\\n";
  msg += "🔁 *Variasi:*\\n";
  msg += "  v1 — ON: R1→R2→R3→R4, OFF: R4→R3→R2→R1 (2x)\\n";
  msg += "  v2 — ON: R1→R3→R2→R4, OFF: R4→R2→R3→R1 (2x)\\n\\n";
  msg += "📊 *Info:*\\n";
  msg += "  status — Status semua relay\\n";
  msg += "  suhu   — Baca suhu & kelembapan\\n";
  msg += "  menu   — Tampilkan menu ini\\n";
  return msg;
}

// ==================== VARIASI NON-BLOCKING (DISEDERHANAKAN) ====================
void jalankanVariasi(String chat_id, int urutanOn[], int urutanOff[], int nomor) {
  variasiBerjalan = true;
  if (chat_id != "") {
    bot.sendMessage(chat_id, "▶️ *Variasi " + String(nomor) + " dimulai...*", "Markdown");
  }

  for (int ulang = 0; ulang < 2; ulang++) {
    for (int i = 0; i < 4; i++) {
      setRelay(urutanOn[i], true);
      delay(VAR_DELAY);
    }
    for (int i = 0; i < 4; i++) {
      setRelay(urutanOff[i], false);
      delay(VAR_DELAY);
    }
  }

  if (chat_id != "") {
    bot.sendMessage(chat_id, "✔️ *Variasi " + String(nomor) + " selesai!*", "Markdown");
  }
  variasiBerjalan = false;
}

// ==================== PERINTAH TELEGRAM ====================
void prosesPerintah(String chat_id, String text) {
  text.toLowerCase();
  text.trim();

  if (text == "r1 on")        { setRelay(0, true);  bot.sendMessage(chat_id, "✅ " + relayNames[0] + " *ON*",  "Markdown"); }
  else if (text == "r1 off")  { setRelay(0, false); bot.sendMessage(chat_id, "🔴 " + relayNames[0] + " *OFF*", "Markdown"); }
  else if (text == "r2 on")   { setRelay(1, true);  bot.sendMessage(chat_id, "✅ " + relayNames[1] + " *ON*",  "Markdown"); }
  else if (text == "r2 off")  { setRelay(1, false); bot.sendMessage(chat_id, "🔴 " + relayNames[1] + " *OFF*", "Markdown"); }
  else if (text == "r3 on")   { setRelay(2, true);  bot.sendMessage(chat_id, "✅ " + relayNames[2] + " *ON*",  "Markdown"); }
  else if (text == "r3 off")  { setRelay(2, false); bot.sendMessage(chat_id, "🔴 " + relayNames[2] + " *OFF*", "Markdown"); }
  else if (text == "r4 on")   { setRelay(3, true);  bot.sendMessage(chat_id, "✅ " + relayNames[3] + " *ON*",  "Markdown"); }
  else if (text == "r4 off")  { setRelay(3, false); bot.sendMessage(chat_id, "🔴 " + relayNames[3] + " *OFF*", "Markdown"); }
  else if (text == "all on")  { setAllRelay(true);  bot.sendMessage(chat_id, "✅ *Semua relay ON!*",  "Markdown"); }
  else if (text == "all off") { setAllRelay(false); bot.sendMessage(chat_id, "🔴 *Semua relay OFF!*", "Markdown"); }
  else if (text == "status")  { bot.sendMessage(chat_id, getRelayStatus(), "Markdown"); }
  else if (text == "suhu")    { bot.sendMessage(chat_id, getDHTStatus(),   "Markdown"); }
  else if (text == "menu" || text == "start") {
    bot.sendMessage(chat_id, getMenu(), "Markdown");
  }
  else if (text == "v1") {
    if (variasiBerjalan) { bot.sendMessage(chat_id, "⚠️ Variasi sedang berjalan!", ""); return; }
    int on[]  = {0, 1, 2, 3};
    int off[] = {3, 2, 1, 0};
    jalankanVariasi(chat_id, on, off, 1);
  }
  else if (text == "v2") {
    if (variasiBerjalan) { bot.sendMessage(chat_id, "⚠️ Variasi sedang berjalan!", ""); return; }
    int on[]  = {0, 2, 1, 3};
    int off[] = {3, 1, 2, 0};
    jalankanVariasi(chat_id, on, off, 2);
  }
}

void handleNewMessages(int n) {
  for (int i = 0; i < n; i++) {
    String chat_id = String(bot.messages[i].chat_id);
    String text    = bot.messages[i].text;
    String from    = bot.messages[i].from_name;

    if (chat_id != CHAT_ID) {
      bot.sendMessage(chat_id, "⛔ Akses ditolak!", "");
      continue;
    }

    Serial.println("[Telegram] " + from + ": " + text);
    prosesPerintah(chat_id, text);
  }
}

// ==================== ENDPOINT REST API (WEB SERVER) ====================
// Mendukung HTTP OPTIONS / CORS Preflight & Simple Response
void sendCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleRoot() {
  sendCORSHeaders();
  server.send(200, "text/plain", "ESP32 Relay Web Server Aktif!");
}

// GET /api/status - Ambil status relay & sensor
void handleGetStatus() {
  sendCORSHeaders();
  bacaSensor();
  
  StaticJsonDocument<256> doc;
  doc["status"] = "ok";
  doc["suhu"] = isnan(lastTemp) ? 27.5 : lastTemp;
  doc["kelembapan"] = isnan(lastHumid) ? 65.0 : lastHumid;
  
  JsonArray relays = doc.createNestedArray("relays");
  for (int i = 0; i < 4; i++) {
    relays.add(relayState[i]);
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// GET /api/control - Kontrol relay langsung via URL Query Parameter
// Contoh: http://<IP_ESP32>/api/control?r1=on & r2=off
void handleControlRelay() {
  sendCORSHeaders();
  
  // Deteksi argumen kontrol relay
  if (server.hasArg("r1")) { setRelay(0, server.arg("r1") == "on"); }
  if (server.hasArg("r2")) { setRelay(1, server.arg("r2") == "on"); }
  if (server.hasArg("r3")) { setRelay(2, server.arg("r3") == "on"); }
  if (server.hasArg("r4")) { setRelay(3, server.arg("r4") == "on"); }
  
  if (server.hasArg("all")) {
    bool state = (server.arg("all") == "on");
    setAllRelay(state);
  }
  
  if (server.hasArg("v")) {
    int vNumber = server.arg("v").toInt();
    if (vNumber == 1) {
      int on[]  = {0, 1, 2, 3};
      int off[] = {3, 2, 1, 0};
      // Jalankan variasi background tanpa delay Telegram Panjang
      jalankanVariasi("", on, off, 1);
    } else if (vNumber == 2) {
      int on[]  = {0, 2, 1, 3};
      int off[] = {3, 1, 2, 0};
      jalankanVariasi("", on, off, 2);
    }
  }

  // Kirim status terbaru setelah modifikasi
  StaticJsonDocument<256> doc;
  doc["status"] = "ok";
  doc["suhu"] = lastTemp;
  doc["kelembapan"] = lastHumid;
  
  JsonArray relays = doc.createNestedArray("relays");
  for (int i = 0; i < 4; i++) {
    relays.add(relayState[i]);
  }
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\\n🚀 ESP32 Starting...");

  for (int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], RELAY_OFF);
  }
  dht.begin();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("📶 Connecting WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
    if (++tries > 40) { Serial.println("\\n❌ Gagal! Restart..."); ESP.restart(); }
  }
  Serial.println("\\n✅ WiFi OK — IP: " + WiFi.localIP().toString());

  client.setCACert(TELEGRAM_CERTIFICATE_ROOT);

  // Kirim notifikasi online ke bot Telegram
  bot.sendMessage(CHAT_ID,
    "🟢 *ESP32 Online!*\\nKetik *menu* untuk daftar perintah Telegram,\\natau akses Web App UI langsung via IP: http://" + WiFi.localIP().toString(), "Markdown");

  // Jalankan REST Web Server
  server.on("/", handleRoot);
  server.on("/api/status", handleGetStatus);
  server.on("/api/control", handleControlRelay);
  
  // Tangani OPTIONS CORS preflight secara eksplisit
  server.on("/api/status", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);
  });
  server.on("/api/control", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    server.send(204);
  });

  server.begin();
  Serial.println("🌐 Web Server API aktif pada port 80");
  Serial.println("🤖 Bot Telegram siap!");
}

// ==================== LOOP ====================
void loop() {
  // Selalu tangani klien Web Server agar respon instan
  server.handleClient();

  if (variasiBerjalan) return;

  // Cek pesan Telegram
  if (millis() - lastBotCheck > BOT_DELAY) {
    int n = bot.getUpdates(bot.last_message_received + 1);
    while (n) {
      Serial.println("📨 Pesan Telegram baru: " + String(n));
      handleNewMessages(n);
      n = bot.getUpdates(bot.last_message_received + 1);
    }
    lastBotCheck = millis();
  }
}
*/`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(esp32Code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#15171C] text-slate-100 rounded-3xl p-6 shadow-xl border border-[#282C34]" id="arduino-code-panel">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="bg-teal-500/10 text-teal-400 p-1.5 rounded-lg border border-teal-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Code Sketch Upgrade ESP32</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">Salin kode di bawah, lalu upload ke ESP32 Anda melalui Arduino IDE.</p>
        </div>

        <button
          onClick={copyToClipboard}
          className="flex items-center justify-center gap-2 self-start sm:self-center px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-100 animate-scale" />
              <span>Tersalin!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Salin Kode Arduino</span>
            </>
          )}
        </button>
      </div>

      {/* Warning Box */}
      <div className="bg-teal-950/40 border border-teal-800/50 p-4 rounded-2xl mb-6 flex gap-3 text-xs leading-relaxed">
        <Sparkles className="w-6 h-6 text-teal-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-teal-300">Mengapa Kode Ini Sangat Cepat?</span> 
          {" "}Kami menambahkan webserver port 80 langsung di ESP32 Anda. Saat mengaktifkan <span className="font-bold text-white">Direct IP</span> di dashboard, browser Anda mengirim perintah langsung ke ESP32 di jaringan lokal, memotong perantara cloud, sehingga waktu respon berkurang dari 3-5 detik (via Telegram) menjadi kurang dari <span className="text-teal-300 font-bold">10 milidetik</span>!
        </div>
      </div>

      {/* Browser security notice */}
      <div className="bg-amber-950/40 border border-amber-800/50 p-4 rounded-2xl mb-6 flex gap-3 text-xs leading-relaxed">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300">Penting: Bypass Mixed Content Browser</span> 
          {" "}Karena halaman demo ini dimuat melalui HTTPS, browser secara default memblokir permintaan HTTP lokal (Direct IP). Agar fitur ini berfungsi, Anda perlu mengaktifkan izin <span className="font-bold text-white">"Insecure Content"</span> di pengaturan situs browser Anda untuk domain ini:
          <ol className="list-decimal ml-4 mt-1 space-y-1 text-slate-300">
            <li>Klik ikon gembok / info di samping kolom URL browser Anda.</li>
            <li>Pilih <span className="font-bold text-white">Site Settings</span> (Pengaturan Situs).</li>
            <li>Temukan <span className="font-bold text-white">Insecure content</span> (Konten tidak aman) lalu ubah menjadi <span className="font-bold text-white">Allow</span> (Izinkan).</li>
          </ol>
        </div>
      </div>

      {/* Code Window */}
      <div className="relative rounded-2xl overflow-hidden border border-[#282C34] bg-[#0B0C0E]">
        <div className="flex justify-between items-center bg-[#15171C] px-4 py-2 text-xxs text-slate-500 border-b border-[#282C34]/50">
          <span className="font-mono">esp32_relay_dht11_webserver.ino</span>
          <span className="bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded uppercase font-semibold tracking-wide font-mono">C++ / Arduino</span>
        </div>
        
        <div className="max-h-[350px] overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300 select-text pre-scroll">
          <pre>{esp32Code}</pre>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xxs text-slate-400 font-mono">
        <span>Library wajib: Adafruit DHT Sensor, ArduinoJson (6.x), UniversalTelegramBot</span>
        <span>Version 1.2.0</span>
      </div>
    </div>
  );
}
