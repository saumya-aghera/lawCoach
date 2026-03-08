/**
 * useSessionSocket.js
 * ===================
 * WebSocket hook for the ADK-powered live coaching session.
 *
 * Lifecycle:
 *   connectSession(ctx) → opens WS → sends init → receives "ready"
 *                       → starts PCM16 audio recorder
 *                       → each audio frame sent as { type:"audio", data:base64 }
 *   server streams back { type:"analysis", ... } events
 *   disconnectSession() → stops recorder + closes WS
 *
 * The server (main.py ws_session) runs the ADK Runner, which:
 *   1. Forwards PCM16 audio to the Gemini Live API
 *   2. The legal_coach agent transcribes, calls search_laws, produces JSON
 *   3. Parses the JSON and forwards { type:"analysis", ... } to this client
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { AudioRecorder } from "./audioRecorder";

function getWsBase() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

/**
 * @param {{ onAnalysis: (result: object) => void }} opts
 */
export function useSessionSocket({ onAnalysis }) {
  const [wsStatus,  setWsStatus]  = useState("DISCONNECTED");
  const [recording, setRecording] = useState(false);

  const ws            = useRef(null);
  const recorder      = useRef(new AudioRecorder(16000));
  const onAnalysisRef = useRef(onAnalysis);

  // Keep callback ref fresh without triggering reconnects
  useEffect(() => { onAnalysisRef.current = onAnalysis; }, [onAnalysis]);

  const _stopRecorder = useCallback(() => {
    recorder.current.stop();
    setRecording(false);
  }, []);

  const disconnectSession = useCallback(() => {
    _stopRecorder();
    ws.current?.close();
    ws.current = null;
    setWsStatus("DISCONNECTED");
  }, [_stopRecorder]);

  /**
   * Open the WebSocket and send session context.
   * Audio recording starts automatically once the server replies "ready".
   *
   * @param {{ situation, state, description, user_lang }} sessionCtx
   */
  const connectSession = useCallback((sessionCtx) => {
    // Re-init an already-open connection
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "init", ...sessionCtx }));
      return;
    }

    const socket = new WebSocket(`${getWsBase()}/ws/session`);
    ws.current = socket;
    setWsStatus("CONNECTING");

    socket.onopen = () => {
      setWsStatus("CONNECTED");
      socket.send(JSON.stringify({ type: "init", ...sessionCtx }));
    };

    socket.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { return; }

      if (msg.type === "ready") {
        // Server has created the ADK session — start streaming PCM16 audio
        try {
          await recorder.current.start((base64Audio) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "audio", data: base64Audio }));
            }
          });
          setRecording(true);
        } catch (err) {
          console.error("[useSessionSocket] Microphone error:", err);
        }

      } else if (msg.type === "analysis") {
        onAnalysisRef.current?.(msg);

      } else if (msg.type === "error") {
        console.error("[useSessionSocket] Server error:", msg.message);
      }
    };

    socket.onclose = () => {
      _stopRecorder();
      setWsStatus("DISCONNECTED");
      ws.current = null;
    };

    socket.onerror = (err) => {
      console.error("[useSessionSocket] WebSocket error:", err);
      setWsStatus("ERROR");
    };
  }, [_stopRecorder]);

  // Clean up on unmount
  useEffect(() => () => disconnectSession(), [disconnectSession]);

  return { wsStatus, recording, connectSession, disconnectSession };
}
