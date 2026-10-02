# Ora (`/ˈɔː.rə/`) — On-Device Edge Voice Action Assistant

> **Organization:** KINGENOUS  
> **Target Platform:** Android (React Native with Expo SDK & Kotlin Native Modules)  
> **Network Footprint:** 0.00 KB (100% Offline, Zero Cloud Dependency)  
> **Latency Budget:** Speech → Intent Slotting → OS Execution in < 200ms  

---

## 🌟 Overview

**Ora** is an offline-native personal action assistant engineered to supersede cloud-dependent assistants. Rather than acting as a conversational chatbot, Ora functions as a **stateless, deterministic action dispatcher**. 

Every voice instruction is transcribed on-device, mapped to an exact intent slot through the **Needle 2** rule-based engine, and dispatched directly to Android OS system services via low-level native bridges.

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ORA PRESENTATION LAYER                   │
│  - Acoustic Gold Ora Orb (OraOrb.tsx / Reanimated Canvas)   │
│  - Console HUD Overlay (Live transcript, slot feedback)      │
│  - Haptic Feedback & Audio Cues                             │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│             EDGE SPEECH & INTENT ENGINE LAYER               │
│  - Android Native SpeechRecognizer (Offline Pack) / Edge STT│
│  - Needle 2 Deterministic Slotting Engine (TypeScript)      │
│  - In-Memory Fuzzy Matcher (Contacts, App Aliases)          │
│  - Local SQLite Store (Audit Log, Persistent Settings)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│           EXPO NATIVE ANDROID BRIDGE (KOTLIN)               │
│  - HardwareModule: Camera Torch, Ringer Mode, Battery, Wake │
│  - TelephonyBridgeModule: Direct SIM Dialing, Cellular SMS  │
│  - NotificationReplyService: RemoteInput Voice Reply        │
│  - AppLauncherModule: PackageManager Fuzzy Execution        │
│  - AlarmModule: System Alarm Clock & Timer Intents          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 1. Zero-Data Cellular & Telephony Actions
- **Direct Carrier Calls:** Places cellular calls directly via `Intent.ACTION_CALL`.
- **Offline SMS:** Sends carrier text messages directly via `SmsManager`.
- **Notification Reply Service:** Intercepts messaging notifications (WhatsApp, Telegram, SMS) and replies hands-free via `RemoteInput.sendIntent()`.

### 2. Hardware Automation
- **Camera Torch:** Instant hardware flashlight toggle via `CameraManager`.
- **Audio Profile Switching:** Instant Silent, Vibrate, and Normal sound toggle via `AudioManager`.
- **Diagnostics:** Battery percentage, thermal status, and charging state queries.
- **Screen Wake:** Wakes the device from locked states when summoned.

### 3. Native Alarms & App Launching
- **Native Alarms:** Triggers Android system alarms and countdown timers via `AlarmClock.ACTION_SET_ALARM`.
- **Fuzzy App Launcher:** Resolves local package names and launches installed applications with phonetic tolerance.

### 4. Acoustic Ora Orb Visualizer
- **4 Deterministic States:**
  - `idle`: Rhythmic breathing pulse (4.5s cycle) with gold acoustic bars.
  - `listening`: Concentric expansion wake rings with dynamic voice wave modulation.
  - `thinking`: Continuous 360° circular orbit ring indicating intent resolution.
  - `error`: Warning red flare and haptic vibration rejection on unslotted input.

---

## 📁 Repository Structure

```
Ora Assistant/
├── PRD.md                         # Detailed Product Requirements Document
├── README.md                      # Developer & System Architecture Guide
├── app.json                       # Expo Application Config & Permissions
├── package.json                   # Dependencies & Scripts
├── tsconfig.json                  # TypeScript Compiler Config
│
├── src/
│   ├── components/
│   │   ├── OraOrb.tsx             # Acoustic Orb Visualizer (Native Reanimated)
│   │   ├── ConsoleOverlay.tsx     # Voice Console & Transcript HUD
│   │   └── ActionHistory.tsx      # SQLite Audit Ledger Viewer
│   │
│   ├── engine/
│   │   ├── needle.ts              # Deterministic Intent Tokenizer & Dispatcher
│   │   ├── schemas.ts             # Strongly Typed Action Schemas
│   │   ├── fuzzy.ts               # Levenshtein Distance & Alias Resolver
│   │   └── grammar.ts             # Deterministic Grammar Patterns
│   │
│   ├── native/
│   │   ├── hardware.ts            # TypeScript bridge to HardwareModule
│   │   ├── telephony.ts           # TypeScript bridge to TelephonyBridgeModule
│   │   ├── notifications.ts       # TypeScript bridge to NotificationReplyService
│   │   └── launcher.ts            # TypeScript bridge to AppLauncherModule
│   │
│   ├── services/
│   │   ├── stt.ts                 # Offline Speech Recognition Service
│   │   └── database.ts            # expo-sqlite Audit & Cache Service
│   │
│   └── App.tsx                    # Main App Entrypoint
│
└── modules/                       # Local Expo Native Modules (Kotlin)
    ├── ora-hardware/
    │   ├── expo-module.config.json
    │   └── android/src/main/java/com/hex8/ora/hardware/HardwareModule.kt
    │
    ├── ora-telephony/
    │   ├── expo-module.config.json
    │   └── android/src/main/java/com/hex8/ora/telephony/TelephonyBridgeModule.kt
    │
    ├── ora-notifications/
    │   ├── expo-module.config.json
    │   └── android/src/main/java/com/hex8/ora/notifications/NotificationReplyService.kt
    │
    └── ora-launcher/
        ├── expo-module.config.json
        └── android/src/main/java/com/hex8/ora/launcher/AppLauncherModule.kt
```

---

## 🛠 Tech Stack

- **Core Framework:** React Native + Expo SDK
- **Language:** TypeScript (Application Layer) & Kotlin (Native Bridge Layer)
- **Animations:** React Native Reanimated / Skia (Hardware-accelerated 60/120 FPS)
- **Local Storage:** `expo-sqlite` (Local Contacts Cache & Audit Logs)
- **Haptics:** `expo-haptics`
- **Native Modules:** Expo Modules API (`expo-module`)

---

## 📋 Deterministic Voice Intent Grammar Reference

| Action | Example Natural Language Utterance | Resolved Action Payload |
|---|---|---|
| **Make Call** | *"Call Mom"* / *"Dial 08012345678"* | `{"action": "make_call", "contact": "Mom"}` |
| **Send SMS** | *"Text Sarah I will be there in 5 minutes"* | `{"action": "send_sms", "contact": "Sarah", "message": "I will be there in 5 minutes"}` |
| **Reply Notification** | *"Reply to WhatsApp I am on my way"* | `{"action": "reply_notification", "app": "whatsapp", "text": "I am on my way"}` |
| **Flashlight On** | *"Turn on flashlight"* / *"Torch on"* | `{"action": "toggle_flashlight", "state": true}` |
| **Flashlight Off** | *"Turn off flashlight"* / *"Torch off"* | `{"action": "toggle_flashlight", "state": false}` |
| **Set Alarm** | *"Wake me up at 6:30 AM"* | `{"action": "set_clock_alert", "time": "06:30", "type": "alarm"}` |
| **Set Timer** | *"Set a 15 minute timer"* | `{"action": "set_clock_alert", "time": "15m", "type": "timer"}` |
| **Launch App** | *"Open YouTube"* / *"Launch Spotify"* | `{"action": "launch_app", "app": "YouTube"}` |
| **Audio Mode** | *"Mute phone"* / *"Set phone to vibrate"* | `{"action": "set_ringer_mode", "mode": "silent"}` |
| **Battery Status** | *"What is my battery level?"* | `{"action": "get_battery_status"}` |

---

## ⚙️ Development & Local Execution

### 1. Prerequisites
- Node.js (v18+)
- Android Studio with Android SDK (API 26+)
- Physical Android device (recommended for cellular calls, torch, and notification listener testing)

### 2. Setup & Installation
```bash
# Install project dependencies
npm install

# Generate Android native project with Expo Config Plugins
npx expo prebuild --platform android

# Run on connected Android device or emulator
npx expo run:android
```

---

## 🛡 Security, Permissions & Privacy

Ora operates under a strict offline-first zero-trust privacy guarantee:
1. **No Internet Permission:** Production builds can strip `android.permission.INTERNET` completely.
2. **Local Contact Indexing:** Contacts are indexed locally in SQLite for sub-5ms fuzzy matching.
3. **Transparent Audit Log:** Every native OS command executed by Ora is viewable in the local database viewer.

---

## 📄 License
Internal Proprietary — © KINGENOUS. All rights reserved.
