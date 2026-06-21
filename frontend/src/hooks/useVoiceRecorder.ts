import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Mobile: use expo-audio. Web: use MediaRecorder.
// Returns ArrayBuffer-as-base64 + mime when stopped.

export type RecordingResult = { base64: string; mime: string; durationMs: number };

const MAX_DURATION_MS = 30_000;

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  // Mobile
  const mobileRecorderRef = useRef<any>(null);
  // Web
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webMimeRef = useRef<string>("audio/webm");

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const tickTimer = () => {
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setDurationMs(elapsed);
      if (elapsed >= MAX_DURATION_MS) {
        // auto stop
        stop();
      }
    }, 200);
  };

  const start = useCallback(async () => {
    setError(null);
    setDurationMs(0);
    if (Platform.OS === "web") {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices) {
          throw new Error("Browser tidak mendukung perekaman");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webStreamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        webMimeRef.current = mime.split(";")[0];
        const rec = new MediaRecorder(stream, { mimeType: mime });
        webChunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) webChunksRef.current.push(e.data);
        };
        rec.start();
        mediaRecorderRef.current = rec;
        startedAtRef.current = Date.now();
        setIsRecording(true);
        tickTimer();
      } catch (e: any) {
        setError(e?.message ?? "Tidak bisa mengakses mikrofon");
      }
    } else {
      try {
        const ExpoAudio = await import("expo-audio");
        // Request permission
        const perm = await ExpoAudio.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setError("Izin mikrofon ditolak. Buka pengaturan untuk mengaktifkan.");
          return;
        }
        await ExpoAudio.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        const recorder = new ExpoAudio.AudioRecorder(
          ExpoAudio.RecordingPresets.HIGH_QUALITY,
        );
        await recorder.prepareToRecordAsync();
        recorder.record();
        mobileRecorderRef.current = recorder;
        startedAtRef.current = Date.now();
        setIsRecording(true);
        tickTimer();
      } catch (e: any) {
        setError(e?.message ?? "Tidak bisa merekam");
      }
    }
  }, []);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    stopTimer();
    setIsRecording(false);
    const elapsed = Date.now() - startedAtRef.current;
    setDurationMs(elapsed);

    if (Platform.OS === "web") {
      const rec = mediaRecorderRef.current;
      if (!rec) return null;
      return await new Promise<RecordingResult | null>((resolve) => {
        rec.onstop = async () => {
          try {
            const blob = new Blob(webChunksRef.current, { type: webMimeRef.current });
            const b64 = await blobToBase64(blob);
            webStreamRef.current?.getTracks().forEach((t) => t.stop());
            webStreamRef.current = null;
            mediaRecorderRef.current = null;
            resolve({ base64: b64, mime: webMimeRef.current, durationMs: elapsed });
          } catch (e) {
            resolve(null);
          }
        };
        rec.stop();
      });
    } else {
      try {
        const ExpoAudio = await import("expo-audio");
        const recorder = mobileRecorderRef.current;
        if (!recorder) return null;
        await recorder.stop();
        const uri: string | null = recorder.uri ?? null;
        mobileRecorderRef.current = null;
        if (!uri) return null;
        // read file as base64
        const FileSystem = await import("expo-file-system");
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { base64: b64, mime: "audio/m4a", durationMs: elapsed };
      } catch (e) {
        console.warn("stop error", e);
        return null;
      }
    }
  }, []);

  const cancel = useCallback(async () => {
    stopTimer();
    setIsRecording(false);
    setDurationMs(0);
    if (Platform.OS === "web") {
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      webStreamRef.current?.getTracks().forEach((t) => t.stop());
      webStreamRef.current = null;
      mediaRecorderRef.current = null;
      webChunksRef.current = [];
    } else {
      try {
        const recorder = mobileRecorderRef.current;
        if (recorder) await recorder.stop();
      } catch {}
      mobileRecorderRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isRecording, durationMs, error, start, stop, cancel, MAX_DURATION_MS };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result as string;
      resolve(r.split(",", 2)[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
