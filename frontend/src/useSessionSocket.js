import { useState, useRef, useCallback, useEffect } from "react";

// Derive WS base URL from VITE_API_URL or current host
function getWsBase() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/^http/, "ws");
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

/**
 * Persistent WebSocket hook for lawCoach audio analysis.
 *
 * Usage:
 *   const { wsStatus, connectSession, sendAudio, disconnectSession } = useSessionSocket({ onAnalysis });
 *
 * @param {object} opts
 * @param {function} opts.onAnalysis - called with the full analysis JSON when a result arrives
 */
export function useSessionSocket({ onAnalysis }) {
  const [wsStatus, setWsStatus] = useState("DISCONNECTED");
  const ws = useRef(null);
  const onAnalysisRef = useRef(onAnalysis);

  // Keep ref in sync so onAnalysis closure captures latest state without reconnect
  useEffect(() => { onAnalysisRef.current = onAnalysis; }, [onAnalysis]);

  const disconnectSession = useCallback(() => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setWsStatus("DISCONNECTED");
  }, []);

  /**
   * Open the WebSocket and send an init message with session context.
   * @param {{ situation, state, description, user_lang }} sessionCtx
   */
  const connectSession = useCallback((sessionCtx) => {
    // If already open just re-init the session context on the server
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "init", ...sessionCtx }));
      return;
    }

    const url = `${getWsBase()}/ws/session`;
    const socket = new WebSocket(url);
    ws.current = socket;
    setWsStatus("CONNECTING");

    socket.onopen = () => {
      setWsStatus("CONNECTED");
      socket.send(JSON.stringify({ type: "init", ...sessionCtx }));
    };

    socket.onclose = () => {
      setWsStatus("DISCONNECTED");
      ws.current = null;
    };

    socket.onerror = (err) => {
      console.error("[useSessionSocket] WebSocket error:", err);
      setWsStatus("ERROR");
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "analysis") {
          onAnalysisRef.current?.(msg);
        } else if (msg.type === "error") {
          console.error("[useSessionSocket] Server error:", msg.message);
        }
        // "ready" and "translation" are handled by callers if needed
      } catch (e) {
        console.error("[useSessionSocket] Failed to parse message:", e);
      }
    };
  }, []);

  /**
   * Send an audio chunk for transcription + analysis.
   * @param {string} audio_base64 - base64-encoded audio blob
   * @param {string} media_type   - e.g. "audio/webm"
   */
  const sendAudio = useCallback((audio_base64, media_type) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "audio", data: audio_base64, media_type }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => disconnectSession(), [disconnectSession]);

  return { wsStatus, connectSession, sendAudio, disconnectSession };
}
