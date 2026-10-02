# Product Requirements Document (PRD): Ora Assistant (v1.0)

**Organization:** KINGENOUS  
**Product:** Ora (`/ˈɔː.rə/`) — On-Device Edge Voice Action Assistant  
**Architecture:** React Native with Expo (Expo SDK + Expo Modules API + Kotlin Native Layer)  
**Target Platform:** Android (API 26+ / Android 8.0 - Android 15+)  
**Document Version:** 1.0.0  
**Status:** Approved for Scaffolding & Engineering  

---

## 1. Executive Summary & Core Constraints

Ora is an ultra-fast, 100% on-device personal voice action dispatcher designed to supersede cloud-dependent assistants like Google Assistant, Siri, and Alexa. Ora is **NOT** a conversational chatbot or LLM wrapper; it is a **stateless, deterministic edge action executor**.

### Non-Negotiable System Invariants
1. **0.00 KB Network Bandwidth:** 100% offline operation. No network calls, telemetry, analytics, or remote API dependencies during runtime.
2. **< 200ms Latency Budget:** From voice command intake to OS action trigger, execution must complete within 200ms.
3. **Stateless Determinism:** Exact slot filling and rule-based grammar mapping rather than probabilistic cloud LLM generation.
4. **Visual Presence:** The acoustic gold Ora Orb (`OraOrb`) visualizer reflecting 4 deterministic operational states (`idle` | `listening` | `thinking` | `error`).
5. **Direct OS Bridge:** Low-level Android capabilities (Cellular Call, SMS, Flashlight, Ringer Audio, Notification Reply, System Alarms, App Launcher) orchestrated via Expo Native Modules.

---

## 2. High-Level System Architecture

```mermaid
graph TD
    A[Microphone Stream] -->|Offline SpeechRecognizer / AudioBuffer| B[Edge Speech-to-Text Pipeline]
    B -->|Raw Text Transcript| C[Needle 2 Deterministic Intent Parser]
    C -->|Structured JSON Action & Slots| D[Ora Core Action Dispatcher]
    D -->|Audit Log| E[(expo-sqlite Local Store)]
    D -->|IPC Bridge Call| F[Expo Native Android Modules]
    
    subgraph Native Android Layer (Kotlin)
        F --> G[HardwareModule: Torch, Ringer, Battery]
        F --> H[TelephonyBridgeModule: Direct Call, Cellular SMS]
        F --> I[NotificationReplyService: NotificationListener + RemoteInput]
        F --> J[AppLauncherModule: PackageManager Fuzzy Match]
        F --> K[AlarmModule: AlarmClock ACTION_SET_ALARM]
    end

    D -->|State & Haptic Feedback| L[UI Layer: OraOrb & ConsoleOverlay]
```

---

## 3. Latency Budget Breakdown (< 200ms Target)

| Phase | Component | Max Latency Budget | Implementation Strategy |
|---|---|---|---|
| **P1** | Audio Buffer Intake & Wake Hook | 35ms | Android Native AudioRecord / SpeechRecognizer partials |
| **P2** | Edge Speech Transcription | 85ms | Android Offline SpeechRecognizer Language Pack / Edge Vosk |
| **P3** | Intent Matching & Slot Extraction | 15ms | In-memory Needle 2 Tokenizer & Levenshtein slotting |
| **P4** | Native Module Bridge Execution | 35ms | Direct Expo Modules JNI/C++ fast-lane IPC to Kotlin |
| **P5** | Hardware/OS Action Fulfillment | 30ms | Direct Android system service call (`CameraManager`, `SmsManager`, `Intent`) |
| **Total** | **End-to-End Voice-to-Action** | **≤ 200ms** | **Deterministic, zero remote round-trips** |

---

## 4. UI Layer & Acoustic Ora Orb Specification

### 4.1 State Machine
The UI is anchored by the **Ora Orb**, an acoustic wave presence that renders state transitions at 60/120 FPS:

| State | Orb Visual Behavior | Color Palette / Gradient | Acoustic Bars Animation |
|---|---|---|---|
| `idle` | Gentle breathing pulse (4.5s cycle) | Gold Amber: `oklch(0.85 0.12 78)` to `oklch(0.45 0.11 48)` | 5 bars slow rhythmic ripple (scale 0.3 - 0.5) |
| `listening` | Rapid expansion, 2 concentric radiating wake rings | Radiant Sun: `oklch(0.9 0.11 82)` to `oklch(0.5 0.12 50)` | Dynamic acoustic waveform responsive to speech |
| `thinking` | Continuous 360° circular orbit ring | Deep Gold Core with rotating accent ring | Bars hidden, rotating halo spinner active (0.7s cycle) |
| `error` | Sudden sharp flare + haptic buzz rejection | Warning Crimson: `oklch(0.78 0.16 25)` to `oklch(0.38 0.14 22)` | Rapid jitter flutters (scale 0.4 - 0.8) |

### 4.2 Expo / React Native Component Strategy
1. **Native Implementation (Primary):** `react-native-reanimated` + `expo-linear-gradient` (or `@shopify/react-native-skia`) for native rendering directly on the Android UI thread without bridge traversal.
2. **Web / Expo DOM Fallback:** Universal support for the exact Tailwind + Framer Motion CSS keyframe implementation via `@expo/dom` or universal React DOM web bundling.

---

## 5. Needle 2 Intent Engine & Schema Specifications

The Needle 2 engine parses natural speech utterances into strongly typed action manifests in TypeScript/JavaScript without external server calls.

### Intent Slotting Matrix

```typescript
export type OraIntent =
  | { action: "make_call"; contact: string; sim_slot?: number }
  | { action: "send_sms"; contact: string; message: string }
  | { action: "reply_notification"; app: "whatsapp" | "telegram" | "sms" | string; text: string }
  | { action: "toggle_flashlight"; state: boolean }
  | { action: "set_clock_alert"; time: string; type: "alarm" | "timer"; label?: string }
  | { action: "launch_app"; app: string }
  | { action: "set_ringer_mode"; mode: "silent" | "vibrate" | "normal" }
  | { action: "get_battery_status" };
```

### Deterministic Rule Engine Rules
- **Call Triggers:** `call [contact]`, `dial [contact]`, `phone [contact]`, `ring [contact]`
- **SMS Triggers:** `text [contact] [message]`, `sms [contact] that [message]`, `message [contact] [message]`
- **Notification Reply Triggers:** `reply [app] [text]`, `answer on [app] [text]`, `respond to [app] with [text]`
- **Hardware Torch Triggers:** `turn on flashlight`, `torch on`, `flashlight off`, `lights on`
- **Alarm Triggers:** `wake me up at [time]`, `set alarm for [time]`, `set a [duration] timer`
- **App Launch Triggers:** `open [app]`, `launch [app]`, `start [app]`, `play [app]`
- **Audio Profile Triggers:** `mute phone`, `silent mode`, `vibrate`, `normal sound`
- **Battery Triggers:** `battery level`, `battery percentage`, `power status`

---

## 6. Android Native Bridge Modules (Kotlin + Expo Modules API)

The native layer is implemented as local Expo Modules using the modern **Expo Modules API** (`expo-module.config.json` + Kotlin):

### 6.1 `HardwareModule.kt`
- **Flashlight Control:**
  - `CameraManager.setTorchMode(cameraId, state)`
- **Audio Modes:**
  - `AudioManager.ringerMode = AudioManager.RINGER_MODE_SILENT / VIBRATE / NORMAL`
  - Access to `NotificationManager.isNotificationPolicyAccessGranted` for DND override.
- **Power & Screen Wake:**
  - Query battery level, charging status via `BatteryManager`.
  - Wake locked screen on voice trigger using `activity.setShowWhenLocked(true)` and `activity.setTurnScreenOn(true)`.

### 6.2 `TelephonyBridgeModule.kt`
- **Direct Cellular Dialer:**
  - Fires `Intent(Intent.ACTION_CALL, Uri.parse("tel:" + sanitizedNumber))`.
  - Resolves contact names to cellular numbers via Android `ContactsContract` queries.
- **Cellular SMS Dispatcher:**
  - Direct transmission via `SmsManager.getDefault().sendTextMessage(number, null, message, sentPI, null)`.
  - Offline delivery status callbacks via `BroadcastReceiver`.

### 6.3 `NotificationReplyService.kt`
- Implements `NotificationListenerService`.
- Intercepts incoming notifications from package names (e.g., `com.whatsapp`, `org.telegram.messenger`, `com.google.android.apps.messaging`).
- Extracts `NotificationCompat.Action` instances carrying `RemoteInput`.
- Sends voice-dictated replies directly using `action.actionIntent.send(context, 0, replyIntent)`.

### 6.4 `AppLauncherModule.kt`
- Queries `packageManager.getInstalledApplications(PackageManager.GET_META_DATA)`.
- Pre-indexes application label aliases (e.g., "WhatsApp", "YouTube", "Spotify", "Camera").
- Employs Levenshtein fuzzy string distance to tolerate phonetic mistranscriptions.
- Invokes `packageManager.getLaunchIntentForPackage(resolvedPackage)`.

---

## 7. Permission Manifest & Security Guardrails

### 7.1 Required Android Permissions (`app.json` / Config Plugin)
```xml
<!-- Telephony & SMS -->
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.SEND_SMS" />
<uses-permission android:name="android.permission.READ_CONTACTS" />

<!-- Hardware & Audio -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NOTIFICATION_POLICY" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- System Alarms & App Launch -->
<uses-permission android:name="com.android.alarm.permission.SET_ALARM" />
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
```

### 7.2 Safety & Privacy Guardrails
1. **Destructive Action Confirmation:** Emergency numbers (911, 112, etc.) require explicit screen confirmation.
2. **Local Contact Caching:** Contact list names and numbers are cached in an encrypted local `expo-sqlite` table for zero-latency fuzzy lookups.
3. **Audit Ledger:** Every executed action is written to a local SQLite database (`ora_audit_log`) for user transparency.
4. **No Cloud Leakage:** All network permissions (`android.permission.INTERNET`) can be completely omitted from the production APK.

---

## 8. Development & Implementation Roadmap

- **Phase 1: Project Initialization & Directory Scaffolding**
  - Initialize Expo project with TypeScript template.
  - Configure `app.json`, permissions, and Expo Config Plugins.
  - Setup `expo-sqlite`, `react-native-reanimated`, `expo-haptics`, `expo-linear-gradient`.
- **Phase 2: UI Presentation & Acoustic Ora Orb**
  - Implement the native Reanimated `OraOrb` with 4 states (`idle`, `listening`, `thinking`, `error`).
  - Create the `ConsoleOverlay` HUD displaying voice transcriptions, intent confidence, and slot confirmations.
- **Phase 3: Needle 2 Deterministic Intent Engine**
  - Implement the in-memory TypeScript regex & token parsing engine.
  - Build fuzzy contact matcher and application catalog indexer.
  - Comprehensive unit test suite for all trigger patterns.
- **Phase 4: Expo Native Modules Bridge (Kotlin)**
  - Scaffold local Expo modules: `HardwareModule`, `TelephonyModule`, `AppLauncherModule`.
  - Implement `NotificationReplyService` with `NotificationListenerService`.
  - Connect TypeScript interfaces to Kotlin native execution functions.
- **Phase 5: Offline Speech Pipeline Integration**
  - Bind Android native speech recognition bridge.
  - Test end-to-end latency budget (<200ms).
- **Phase 6: Verification, Prebuild & Device Validation**
  - Run `npx expo prebuild` and validate Android builds via `npx expo run:android`.
