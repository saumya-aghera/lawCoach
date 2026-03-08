/**
 * audioRecorder.js
 * ================
 * Captures microphone audio as raw PCM16 at 16 kHz and delivers it as
 * base64-encoded chunks via a callback.
 *
 * The ADK Live API (and Gemini Live) expect:
 *   mime_type : "audio/pcm;rate=16000"
 *   encoding  : signed 16-bit little-endian, mono
 *
 * Adapted from way-back-home/solutions/level_3/frontend/src/audioRecorder.js
 */

export class AudioRecorder {
  constructor(sampleRate = 16000) {
    this.sampleRate   = sampleRate;
    this.audioContext = null;
    this.mediaStream  = null;
    this.processor    = null;
    this.onAudioData  = null;
  }

  /** @param {(base64: string) => void} onAudioData */
  async start(onAudioData) {
    this.onAudioData = onAudioData;

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate:       this.sampleRate,
        channelCount:     1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
    });

    const source      = this.audioContext.createMediaStreamSource(this.mediaStream);
    // ScriptProcessorNode — buffer of 4096 samples at 16 kHz ≈ 256 ms per chunk
    this.processor    = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);

      // Float32 → Int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
      }

      // Int16 bytes → base64
      const uint8  = new Uint8Array(int16.buffer);
      let binary   = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      this.onAudioData?.(btoa(binary));
    };

    source.connect(this.processor);
    // Connect to destination to keep the graph alive (output is silent)
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor?.disconnect();
    this.processor = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    this.audioContext?.close();
    this.audioContext = null;
  }
}
