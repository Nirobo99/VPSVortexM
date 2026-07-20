export const VOICE_MAX_SECONDS = 120;
export const VIDEO_NOTE_MAX_SECONDS = 60;

export function pickRecorderMime(candidates: string[]): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function pickVoiceMime(): string {
  return (
    pickRecorderMime([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ]) || "audio/webm"
  );
}

export function pickVideoNoteMime(): string {
  return (
    pickRecorderMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ]) || "video/webm"
  );
}

export function blobToFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type: type || blob.type });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
