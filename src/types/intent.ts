export type OrbMode = 'idle' | 'listening' | 'executing' | 'confirmed' | 'thinking' | 'error';

export type OraIntent =
  | { action: 'make_call'; contact: string; sim_slot?: number }
  | { action: 'send_sms'; contact: string; message: string }
  | { action: 'reply_notification'; app: 'whatsapp' | 'telegram' | 'sms' | string; text: string }
  | { action: 'toggle_flashlight'; state: boolean }
  | { action: 'set_clock_alert'; time: string; type: 'alarm' | 'timer'; label?: string }
  | { action: 'launch_app'; app: string }
  | { action: 'set_ringer_mode'; mode: 'silent' | 'vibrate' | 'normal' }
  | { action: 'get_battery_status' }
  | { action: 'lock_device' }
  | { action: 'volume_control'; direction: 'up' | 'down' | 'mute' | 'unmute' | 'max' | 'percent'; value?: number }
  | { action: 'open_settings_section'; section: 'wifi' | 'bluetooth' | 'display' | 'sound' | 'battery' | 'apps' | 'general' }
  | { action: 'get_time_date'; query: 'time' | 'date' | 'day' }
  | { action: 'calculate_math'; expression: string }
  | { action: 'web_search'; query: string; engine: 'google' | 'youtube' }
  | { action: 'take_note'; text: string }
  | { action: 'disambiguate_choice'; index: number; name?: string }
  | { action: 'conversational'; kind: 'identity' | 'joke' | 'capabilities' | 'greeting' | 'wake_prompt' | 'affection' | 'gratitude' | 'status' };

export interface IntentResolution {
  rawTranscript: string;
  intent: OraIntent | null;
  confidence: number;
  latencyMs: number;
  matchedTrigger?: string;
  error?: string;
}

export interface ActionAuditLog {
  id?: number;
  timestamp: string;
  transcript: string;
  action: string;
  payload: string;
  latencyMs: number;
  status: 'success' | 'failed' | 'simulated';
}
