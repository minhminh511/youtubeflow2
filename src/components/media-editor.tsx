"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, Crop, Download, Eraser, FlipHorizontal2, Image as ImageIcon, Layers, Loader2, Pause, Play, Plus, RotateCcw, RotateCw, Scissors, ShieldCheck, Sparkles, Trash2, Type, Upload, Wand2, X } from "lucide-react";
import { CopyButton, downloadText } from "@/components/ui";
import { requestJson } from "@/lib/client";
import { analyzeMetadata, buildAssistant, keywordsOf, LIMITS, type ContentKind, type MetadataDraft, type PolicyReport } from "@/lib/policy";
import type { View, WorkspaceData } from "@/lib/types";

type Adjust = { brightness: number; contrast: number; saturation: number; temperature: number; fade: number; vignette: number; grain: number; blur: number };
type Transform = { rotate: number; flipH: boolean; flipV: boolean; zoom: number; offsetX: number; offsetY: number; ratio: string };
type Overlay = { id: string; text: string; x: number; y: number; size: number; color: string; weight: number; stroke: number; chip: boolean; shadow: boolean };
type BlurBox = { id: string; x: number; y: number; w: number; h: number };
type Item = { id: string; kind: "image" | "video"; name: string; url: string; width: number; height: number; duration: number; bytes: number; file: File | null; source: "local" | "youtube" };
type Snapshot = { adjust: Adjust; transform: Transform; overlays: Overlay[]; boxes: BlurBox[] };

const ADJUST: Adjust = { brightness: 100, contrast: 100, saturation: 100, temperature: 0, fade: 0, vignette: 0, grain: 0, blur: 0 };
const TRANSFORM: Transform = { rotate: 0, flipH: false, flipV: false, zoom: 100, offsetX: 0, offsetY: 0, ratio: "free" };
const RATIOS: { id: string; label: string; value: number | null }[] = [
  { id: "free", label: "Tự do", value: null },
  { id: "16:9", label: "16:9 · Thumbnail 1280x720", value: 16 / 9 },
  { id: "9:16", label: "9:16 · Shorts 1080x1920", value: 9 / 16 },
  { id: "1:1", label: "1:1 · Avatar/Community", value: 1 },
  { id: "4:5", label: "4:5 · Bài đăng dọc", value: 4 / 5 },
];
const PRESETS: { name: string; adjust: Adjust }[] = [
  { name: "Gốc", adjust: ADJUST },
  { name: "Rực rỡ", adjust: { ...ADJUST, brightness: 106, contrast: 114, saturation: 128 } },
  { name: "Điện ảnh", adjust: { ...ADJUST, contrast: 118, saturation: 92, temperature: -8, vignette: 26, fade: 6 } },
  { name: "Ấm áp", adjust: { ...ADJUST, brightness: 104, temperature: 22, saturation: 112 } },
  { name: "Lạnh", adjust: { ...ADJUST, contrast: 106, temperature: -22, saturation: 104 } },
  { name: "Teal & Orange", adjust: { ...ADJUST, contrast: 120, saturation: 122, temperature: 14 } },
  { name: "Đơn sắc", adjust: { ...ADJUST, saturation: 0, contrast: 116 } },
  { name: "Noir", adjust: { ...ADJUST, saturation: 0, contrast: 140, vignette: 34, grain: 12 } },
  { name: "Cổ điển", adjust: { ...ADJUST, temperature: 18, fade: 18, saturation: 88, grain: 10 } },
  { name: "Mờ ảo", adjust: { ...ADJUST, brightness: 108, fade: 14, saturation: 94 } },
  { name: "Nét căng", adjust: { ...ADJUST, contrast: 126, brightness: 102, saturation: 116 } },
  { name: "Phím tối", adjust: { ...ADJUST, brightness: 90, contrast: 122, vignette: 30, saturation: 96 } },
];
const EXPORT_PRESETS: { id: string; label: string; width: number; height: number }[] = [
  { id: "source", label: "Giữ kích thước gốc", width: 0, height: 0 },
  { id: "thumb", label: "Thumbnail YouTube 1280x720", width: 1280, height: 720 },
  { id: "short", label: "Shorts dọc 1080x1920", width: 1080, height: 1920 },
  { id: "hd", label: "Ảnh HD 1920x1080", width: 1920, height: 1080 },
  { id: "avatar", label: "Avatar kênh 800x800", width: 800, height: 800 },
];
const CATEGORIES = [
  { id: "22", label: "Mọi người & Blog" }, { id: "1", label: "Phim & Hoạt hình" }, { id: "17", label: "Thể thao" },
  { id: "19", label: "Du lịch & Sự kiện" }, { id: "20", label: "Trò chơi" }, { id: "23", label: "Hài kịch" },
  { id: "24", label: "Giải trí" }, { id: "25", label: "Tin tức & Chính trị" }, { id: "26", label: "Bí quyết & Phong cách" },
  { id: "27", label: "Giáo dục" }, { id: "28", label: "Khoa học & Công nghệ" }, { id: "29", label: "Phi lợi nhuận" },
];
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function filterOf(adjust: Adjust) {
  return `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%) sepia(${Math.max(adjust.temperature, 0) * 0.6}%) hue-rotate(${adjust.temperature * -0.4}deg) blur(${adjust.blur / 10}px)`;
}

export function MediaEditor({ data, onNavigate, notify }: { data: WorkspaceData; onNavigate: (view: View) => void; notify: (message: string, error?: boolean) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Adjust>(ADJUST);
  const [transform, setTransform] = useState<Transform>(TRANSFORM);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [boxes, setBoxes] = useState<BlurBox[]>([]);
  const [panel, setPanel] = useState<"adjust" | "preset" | "crop" | "text" | "privacy" | "video" | "export" | "policy" | "ai">("adjust");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [muted, setMuted] = useState(false);
  const [bitrate, setBitrate] = useState(8);
  const [exportPreset, setExportPreset] = useState("thumb");
  const [format, setFormat] = useState<"image/jpeg" | "image/png" | "image/webp">("image/jpeg");
  const [quality, setQuality] = useState(85);
  const [exportInfo, setExportInfo] = useState<{ url: string; bytes: number; width: number; height: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagText, setTagText] = useState("");
  const [kind, setKind] = useState<ContentKind>("video");
  const [privacy, setPrivacy] = useState("private");
  const [publishAt, setPublishAt] = useState("");
  const [categoryId, setCategoryId] = useState("26");
  const [madeForKids, setMadeForKids] = useState(false);
  const [paidPromotion, setPaidPromotion] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const noiseRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const active = items.find((item) => item.id === activeId) || null;
  const channelTitle = data.channel?.title || "Kênh của bạn";
  const handle = data.channel?.channelId ? "" : "@HangulMinh";

  const tags = useMemo(() => tagText.split(",").map((tag) => tag.trim()).filter(Boolean), [tagText]);
  const draft: MetadataDraft = useMemo(() => ({
    kind, title, description, tags, categoryId, madeForKids, privacyStatus: privacy, paidPromotion,
    language: "vi", hasCaptions,
    durationSeconds: active?.kind === "video" ? (trimEnd > 0 ? trimEnd - trimStart : active.duration) || null : null,
    thumbnail: exportInfo ? { width: exportInfo.width, height: exportInfo.height, bytes: exportInfo.bytes } : null,
    handle: handle || "@HangulMinh",
  }), [kind, title, description, tags, categoryId, madeForKids, privacy, paidPromotion, hasCaptions, active, trimEnd, trimStart, exportInfo, handle]);
  const report: PolicyReport = useMemo(() => analyzeMetadata(draft), [draft]);
  const assistant = useMemo(() => buildAssistant(draft, report, channelTitle), [draft, report, channelTitle]);

  const snapshot = useCallback((): Snapshot => ({ adjust, transform, overlays: overlays.map((o) => ({ ...o })), boxes: boxes.map((b) => ({ ...b })) }), [adjust, transform, overlays, boxes]);
  const commit = useCallback((next: Partial<Snapshot>) => {
    setHistory((past) => [...past.slice(-24), { adjust, transform, overlays, boxes }]);
    setFuture([]);
    if (next.adjust) setAdjust(next.adjust);
    if (next.transform) setTransform(next.transform);
    if (next.overlays) setOverlays(next.overlays);
    if (next.boxes) setBoxes(next.boxes);
  }, [adjust, transform, overlays, boxes]);
  function undo() {
    setHistory((past) => {
      if (!past.length) return past;
      const previous = past[past.length - 1];
      setFuture((next) => [snapshot(), ...next].slice(0, 25));
      setAdjust(previous.adjust); setTransform(previous.transform); setOverlays(previous.overlays); setBoxes(previous.boxes);
      return past.slice(0, -1);
    });
  }
  function redo() {
    setFuture((next) => {
      if (!next.length) return next;
      const restored = next[0];
      setHistory((past) => [...past, snapshot()]);
      setAdjust(restored.adjust); setTransform(restored.transform); setOverlays(restored.overlays); setBoxes(restored.boxes);
      return next.slice(1);
    });
  }

  async function importFiles(list: FileList | File[]) {
    const files = [...list].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!files.length) { notify("Chỉ hỗ trợ file ảnh hoặc video.", true); return; }
    const created: Item[] = [];
    for (const file of files.slice(0, 8)) {
      const url = URL.createObjectURL(file);
      try {
        if (file.type.startsWith("image/")) {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Ảnh không đọc được")); img.src = url; });
          created.push({ id: uid(), kind: "image", name: file.name, url, width: image.naturalWidth, height: image.naturalHeight, duration: 0, bytes: file.size, file, source: "local" });
        } else {
          const meta = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata"; video.muted = true;
            video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 });
            video.onerror = () => reject(new Error("Video không đọc được"));
            video.src = url;
          });
          created.push({ id: uid(), kind: "video", name: file.name, url, width: meta.width, height: meta.height, duration: meta.duration, bytes: file.size, file, source: "local" });
        }
      } catch (error) { notify(error instanceof Error ? error.message : "Không nhập được file", true); URL.revokeObjectURL(url); }
    }
    if (created.length) {
      setItems((current) => [...current, ...created]);
      const first = created[0];
      setActiveId(first.id); setKind(first.kind === "image" ? "image" : first.width >= first.height ? "video" : "short");
      setTrimStart(0); setTrimEnd(first.duration); setTime(0);
      notify(`Đã nhập ${created.length} file vào phòng dựng.`);
    }
  }

  async function useVideoThumbnail(thumbUrl: string, label: string) {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => reject(new Error("Không tải được ảnh thu nhỏ (YouTube chặn CORS).")); img.src = thumbUrl; });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      const item: Item = { id: uid(), kind: "image", name: `Thumbnail · ${label}`, url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, duration: 0, bytes: Math.round(canvas.toDataURL("image/png").length * 0.75), file: null, source: "youtube" };
      setItems((current) => [...current, item]); setActiveId(item.id); setKind("image"); setPanel("adjust");
      notify("Đã đưa ảnh thu nhỏ vào phòng dựng để tối ưu lại.");
    } catch (error) { notify(error instanceof Error ? error.message : "Không tải được thumbnail", true); }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const source = active.kind === "video" ? videoRef.current : imageRef.current;
    if (!source) return;
    if (active.kind === "image" && (!(source as HTMLImageElement).complete || !(source as HTMLImageElement).naturalWidth)) return;
    if (active.kind === "video" && (source as HTMLVideoElement).readyState < 2) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const preset = EXPORT_PRESETS.find((item) => item.id === exportPreset);
    const ratio = RATIOS.find((item) => item.id === transform.ratio)?.value ?? null;
    let width = active.width || 1280;
    let height = active.height || 720;
    if (preset && preset.width) { width = preset.width; height = preset.height; }
    else if (ratio) { height = Math.round(width / ratio); }
    if (transform.rotate % 180 !== 0 && !(preset && preset.width)) { const swap = width; width = height; height = swap; }
    canvas.width = width; canvas.height = height;

    context.save();
    context.fillStyle = "#0b0b12"; context.fillRect(0, 0, width, height);
    context.translate(width / 2, height / 2);
    context.rotate((transform.rotate * Math.PI) / 180);
    context.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
    const video = active.kind === "video" ? (source as HTMLVideoElement) : null;
    const sourceWidth = video ? video.videoWidth || width : (source as HTMLImageElement).naturalWidth || width;
    const sourceHeight = video ? video.videoHeight || height : (source as HTMLImageElement).naturalHeight || height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight) * (transform.zoom / 100);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.filter = filterOf(adjust);
    context.drawImage(source, -drawWidth / 2 + (transform.offsetX / 100) * width, -drawHeight / 2 + (transform.offsetY / 100) * height, drawWidth, drawHeight);
    context.filter = "none";
    context.restore();
    context.save();

    for (const box of boxes) {
      const bx = (box.x / 100) * width; const by = (box.y / 100) * height;
      const bw = Math.max((box.w / 100) * width, 8); const bh = Math.max((box.h / 100) * height, 8);
      const tiny = document.createElement("canvas");
      tiny.width = Math.max(2, Math.round(bw / 14)); tiny.height = Math.max(2, Math.round(bh / 14));
      const tinyContext = tiny.getContext("2d");
      if (tinyContext) {
        tinyContext.drawImage(canvas, bx, by, bw, bh, 0, 0, tiny.width, tiny.height);
        context.imageSmoothingEnabled = false;
        context.drawImage(tiny, bx, by, bw, bh);
        context.imageSmoothingEnabled = true;
      }
    }
    if (adjust.fade > 0) { context.fillStyle = `rgba(255,255,255,${adjust.fade / 260})`; context.fillRect(0, 0, width, height); }
    if (adjust.vignette > 0) {
      const gradient = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
      gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, `rgba(0,0,0,${adjust.vignette / 130})`);
      context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    }
    if (adjust.grain > 0) {
      if (!noiseRef.current) {
        const noise = document.createElement("canvas"); noise.width = 160; noise.height = 160;
        const noiseContext = noise.getContext("2d");
        if (noiseContext) {
          const imageData = noiseContext.createImageData(160, 160);
          for (let index = 0; index < imageData.data.length; index += 4) {
            const value = 120 + Math.random() * 135;
            imageData.data[index] = value; imageData.data[index + 1] = value; imageData.data[index + 2] = value; imageData.data[index + 3] = 255;
          }
          noiseContext.putImageData(imageData, 0, 0);
        }
        noiseRef.current = noise;
      }
      if (noiseRef.current) {
        context.save(); context.globalAlpha = adjust.grain / 320; context.globalCompositeOperation = "overlay";
        const pattern = context.createPattern(noiseRef.current, "repeat");
        if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, width, height); }
        context.restore();
      }
    }
    for (const overlay of overlays) {
      const fontSize = Math.round((overlay.size / 100) * height * 0.16);
      context.font = `${overlay.weight} ${fontSize}px Inter, system-ui, sans-serif`;
      context.textAlign = "center"; context.textBaseline = "middle";
      const x = (overlay.x / 100) * width; const y = (overlay.y / 100) * height;
      const metrics = context.measureText(overlay.text);
      if (overlay.chip) {
        const padX = fontSize * 0.45; const padY = fontSize * 0.28;
        context.fillStyle = "rgba(10,8,20,0.72)";
        context.beginPath();
        context.roundRect(x - metrics.width / 2 - padX, y - fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2, fontSize * 0.28);
        context.fill();
      }
      if (overlay.shadow) { context.shadowColor = "rgba(0,0,0,0.65)"; context.shadowBlur = fontSize * 0.35; context.shadowOffsetY = fontSize * 0.08; }
      if (overlay.stroke > 0) { context.lineWidth = (overlay.stroke / 100) * fontSize * 0.4; context.strokeStyle = "rgba(8,6,16,0.92)"; context.strokeText(overlay.text, x, y); }
      context.shadowColor = "transparent"; context.shadowBlur = 0; context.shadowOffsetY = 0;
      context.fillStyle = overlay.color; context.fillText(overlay.text, x, y);
    }
    context.restore();
  }, [active, adjust, transform, overlays, boxes, exportPreset]);

  useEffect(() => {
    if (!active) return;
    if (active.kind === "image") { draw(); return; }
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    loop();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active, draw]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || active.kind !== "video") return;
    video.muted = muted;
    const onTime = () => {
      setTime(video.currentTime);
      if (trimEnd > 0 && video.currentTime >= trimEnd) { video.pause(); setPlaying(false); video.currentTime = trimStart; }
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [active, muted, trimStart, trimEnd]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { if (video.currentTime < trimStart || (trimEnd > 0 && video.currentTime >= trimEnd)) video.currentTime = trimStart; void video.play(); setPlaying(true); }
    else { video.pause(); setPlaying(false); }
  }
  function seek(value: number) { const video = videoRef.current; if (video) { video.currentTime = value; setTime(value); } }

  async function exportImage(): Promise<{ blob: Blob; width: number; height: number } | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality / 100));
    if (!blob) return null;
    return { blob, width: canvas.width, height: canvas.height };
  }

  async function handleExport() {
    if (!active) return;
    setBusy(true);
    try {
      if (active.kind === "image") {
        const result = await exportImage();
        if (!result) throw new Error("Không xuất được ảnh.");
        const url = URL.createObjectURL(result.blob);
        const extension = format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg";
        setExportInfo({ url, bytes: result.blob.size, width: result.width, height: result.height, name: `${active.name.replace(/\.[^.]+$/, "")}-tubeflow.${extension}` });
        notify(`Đã xuất ảnh ${result.width}x${result.height} · ${(result.blob.size / 1024).toFixed(0)}KB.`);
      } else {
        const canvas = canvasRef.current; const video = videoRef.current;
        if (!canvas || !video) throw new Error("Canvas chưa sẵn sàng.");
        const stream = canvas.captureStream(30);
        const capture = video as HTMLVideoElement & { captureStream?: () => MediaStream };
        if (!muted && typeof capture.captureStream === "function") {
          const audioTracks = capture.captureStream().getAudioTracks();
          for (const track of audioTracks) stream.addTrack(track);
        }
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate * 1_000_000 });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mime })); });
        video.currentTime = trimStart;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
        recorder.start(200);
        await video.play(); setPlaying(true);
        const stopAt = trimEnd > 0 ? trimEnd : video.duration;
        await new Promise<void>((resolve) => {
          const check = () => { if (video.currentTime >= stopAt - 0.05 || video.ended) { resolve(); return; } requestAnimationFrame(check); };
          check();
        });
        video.pause(); setPlaying(false); recorder.stop();
        const blob = await finished;
        const url = URL.createObjectURL(blob);
        setExportInfo({ url, bytes: blob.size, width: canvas.width, height: canvas.height, name: `${active.name.replace(/\.[^.]+$/, "")}-cut.webm` });
        notify(`Đã xuất video ${clock(stopAt - trimStart)} · ${(blob.size / 1024 / 1024).toFixed(1)}MB.`);
      }
    } catch (error) { notify(error instanceof Error ? error.message : "Xuất file thất bại", true); }
    finally { setBusy(false); }
  }

  function downloadExported() {
    if (!exportInfo) return;
    const link = document.createElement("a");
    link.href = exportInfo.url; link.download = exportInfo.name; link.click();
    notify(`Đã tải ${exportInfo.name}.`);
  }

  async function captureFrame() {
    const canvas = canvasRef.current; const video = videoRef.current;
    if (!canvas || !video || !active) return;
    const url = canvas.toDataURL("image/png");
    const item: Item = { id: uid(), kind: "image", name: `Khung hình ${clock(video.currentTime)} · ${active.name}`, url, width: canvas.width, height: canvas.height, duration: 0, bytes: Math.round(url.length * 0.75), file: null, source: "local" };
    setItems((current) => [...current, item]); setActiveId(item.id); setKind("image");
    notify("Đã bắt khung hình thành ảnh để làm thumbnail.");
  }

  async function pushToYouTube(event: FormEvent) {
    event.preventDefault();
    if (!report.readyToPublish) { notify(`Còn ${report.blockers.length} lỗi chặn vi phạm chính sách. Hãy xử lý trước khi đăng.`, true); setPanel("policy"); return; }
    const file = active?.kind === "video" ? (exportInfo ? await fetch(exportInfo.url).then((response) => response.blob()) : active.file) : active?.file;
    if (!file || active?.kind !== "video") { notify("Cần một video (đã cắt hoặc file gốc) để đẩy sang YouTube.", true); return; }
    if (!data.channel) {
      downloadText(`ghi-chu-${Date.now()}.txt`, assistant.notes);
      notify("Chưa kết nối OAuth nên không đăng trực tiếp được. TubeFlow đã tải gói ghi chú tối ưu — mở studio.youtube.com để dán vào.", true);
      window.open("https://studio.youtube.com", "_blank", "noopener");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file instanceof Blob ? new File([file], active.name, { type: file.type || "video/webm" }) : file);
      form.set("title", title.slice(0, LIMITS.title));
      form.set("description", description.slice(0, LIMITS.description));
      form.set("privacyStatus", publishAt ? "private" : privacy);
      form.set("format", kind === "short" ? "short" : "video");
      if (publishAt) form.set("publishAt", new Date(publishAt).toISOString());
      const result = await requestJson<{ upload: { id: string; status: string }; video: { id: string } | null }>("/api/youtube/upload", { method: "POST", body: form });
      if (result.video) {
        await requestJson(`/api/youtube/videos/${result.video.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localNotes: assistant.notes.slice(0, 5000), localStatus: "published" }),
        }).catch(() => undefined);
      }
      notify("Đã đẩy video sang YouTube kèm ghi chú tối ưu. Đang mở YouTube Studio…");
      window.open("https://studio.youtube.com", "_blank", "noopener");
      onNavigate("studio");
    } catch (error) { notify(error instanceof Error ? error.message : "Không đẩy được video", true); }
    finally { setBusy(false); }
  }

  function onCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || (!overlays.length && !boxes.length)) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const target = [...overlays].reverse().find((overlay) => Math.abs(overlay.x - x) < 12 && Math.abs(overlay.y - y) < 8)
      || [...boxes].reverse().find((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
    if (target) { setDragging(target.id); (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId); }
  }
  function onCanvasPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    if (overlays.some((overlay) => overlay.id === dragging)) setOverlays((current) => current.map((overlay) => overlay.id === dragging ? { ...overlay, x, y } : overlay));
    else setBoxes((current) => current.map((box) => box.id === dragging ? { ...box, x, y } : box));
  }

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void, suffix = "") => (
    <label className="block text-[11px] text-slate-600">
      <span className="mb-1 flex items-center justify-between"><span>{label}</span><strong className="font-mono text-slate-800">{value}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        onPointerUp={() => commit({})} className="w-full accent-[#7858d6]" />
    </label>
  );

  const panels: { id: typeof panel; label: string; icon: typeof Wand2 }[] = [
    { id: "adjust", label: "Sáng & màu", icon: Wand2 }, { id: "preset", label: "Bộ lọc", icon: Layers },
    { id: "crop", label: "Cắt & xoay", icon: Crop }, { id: "text", label: "Chữ & tiêu đề", icon: Type },
    { id: "privacy", label: "Che mờ riêng tư", icon: Eraser }, { id: "video", label: "Dựng video", icon: Scissors },
    { id: "export", label: "Xuất bản", icon: Download }, { id: "policy", label: "Chính sách", icon: ShieldCheck },
    { id: "ai", label: "Trợ lý AI", icon: Sparkles },
  ];

  return (
    <div className="media-workspace space-y-4">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PHÒNG DỰNG CHUYÊN NGHIỆP</p>
          <h1>Phòng dựng<span className="heading-dot">.</span></h1>
          <p className="text-[12.5px] text-slate-500">Ý tưởng của bạn, khung hình của bạn. Chỉnh ảnh, biên tập video và chuẩn bị thumbnail ngay trong một không gian.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="button" onClick={undo} disabled={!history.length}><RotateCcw size={14} />Hoàn tác</button>
          <button className="button" onClick={redo} disabled={!future.length}><RotateCw size={14} />Làm lại</button>
          <button className="button button-primary" onClick={() => fileRef.current?.click()}><Plus size={15} />Nhập file</button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ""; }} />

      <div className="editor-workbench" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files); }}>
        <aside className="editor-library">
          <div className="card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Thư viện ({items.length})</h3>
            <button className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d9d3ec] bg-[#faf8fe] px-3 py-4 text-[11.5px] text-[#6f579c]" onClick={() => fileRef.current?.click()}><Upload size={14} />Kéo thả hoặc chọn ảnh/video</button>
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.id} className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${item.id === activeId ? "border-[#c9b8ee] bg-[#f4efff]" : "border-transparent hover:bg-[#f8f6fc]"}`}>
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setActiveId(item.id); setKind(item.kind === "image" ? "image" : item.width >= item.height ? "video" : "short"); setTrimStart(0); setTrimEnd(item.duration); }}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-[#efeaf9] text-[#7858d6]">
                      {item.kind === "image" ? <ImageIcon size={14} /> : <Camera size={14} />}
                    </span>
                    <span className="min-w-0"><strong className="block truncate text-[11px] font-medium">{item.name}</strong><small className="text-[10px] text-slate-500">{item.width}x{item.height}{item.duration ? ` · ${clock(item.duration)}` : ""}</small></span>
                  </button>
                  <button className="text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-[#9d485a]" onClick={() => { setItems((current) => current.filter((entry) => entry.id !== item.id)); if (activeId === item.id) setActiveId(null); }} aria-label="Xoá"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>
          {data.videos.length > 0 && (
            <div className="card p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Thumbnail từ kênh</h3>
              <div className="space-y-1.5">
                {data.videos.slice(0, 6).map((video) => (
                  <button key={video.id} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f8f6fc]" onClick={() => video.thumbnail && void useVideoThumbnail(video.thumbnail, video.title)} disabled={!video.thumbnail}>
                    {video.thumbnail ? <img src={video.thumbnail} alt="" className="h-8 w-14 shrink-0 rounded object-cover" /> : <span className="flex h-8 w-14 items-center justify-center rounded bg-[#efeaf9]"><ImageIcon size={13} /></span>}
                    <span className="min-w-0 text-[11px] leading-tight">{video.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="editor-preview-column space-y-3">
          <div className="card overflow-hidden p-0">
            <div className="editor-canvas-stage relative flex items-center justify-center p-3">
              {active ? (
                <canvas ref={canvasRef} className="max-h-[62vh] w-auto max-w-full rounded shadow-lg" onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} />
              ) : (
                <div className="py-16 text-center text-slate-400"><ImageIcon size={34} className="mx-auto mb-3 opacity-60" /><p className="text-[12.5px]">Nhập ảnh hoặc video để bắt đầu dựng</p><p className="mt-1 text-[11px] opacity-70">Hỗ trợ JPG/PNG/WebP/GIF và MP4/WebM/MOV</p></div>
              )}
              {active?.kind === "video" && <video ref={videoRef} src={active.url} className="hidden" playsInline preload="auto" crossOrigin="anonymous" />}
              {active?.kind === "image" && <img ref={imageRef} src={active.url} alt="" className="hidden" onLoad={draw} />}
            </div>
            {active && (
              <div className="flex flex-wrap items-center gap-3 border-t border-[#eeeaf5] bg-white px-3 py-2">
                {active.kind === "video" && (
                  <>
                    <button className="button button-primary" onClick={togglePlay}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Tạm dừng" : "Phát"}</button>
                    <span className="font-mono text-[11px] text-slate-600">{clock(time)} / {clock(active.duration)}</span>
                    <input type="range" min={0} max={active.duration || 1} step={0.05} value={time} onChange={(event) => seek(Number(event.target.value))} className="min-w-[140px] flex-1 accent-[#7858d6]" />
                    <button className="button" onClick={captureFrame}><Camera size={14} />Bắt khung hình</button>
                  </>
                )}
                <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${report.readyToPublish ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {report.readyToPublish ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}{report.score}/100 · {report.grade}
                  </span>
                  <span>{active.width}x{active.height}</span>
                </span>
              </div>
            )}
          </div>

          <div className="card p-3">
            <div className="editor-tool-tabs mb-3 flex flex-wrap" role="group" aria-label="Công cụ phòng dựng">
              {panels.map((entry) => { const Icon = entry.icon; return (
                <button key={entry.id} aria-pressed={panel === entry.id} onClick={() => setPanel(entry.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition ${panel === entry.id ? "bg-[#7858d6] text-white" : "bg-[#f4f1fb] text-[#5f5a6e] hover:bg-[#ece5f9]"}`}>
                  <Icon size={13} />{entry.label}
                </button>); })}
            </div>

            {panel === "adjust" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {slider("Độ sáng", adjust.brightness, 40, 180, 1, (value) => setAdjust({ ...adjust, brightness: value }), "%")}
                {slider("Tương phản", adjust.contrast, 40, 200, 1, (value) => setAdjust({ ...adjust, contrast: value }), "%")}
                {slider("Bão hoà màu", adjust.saturation, 0, 220, 1, (value) => setAdjust({ ...adjust, saturation: value }), "%")}
                {slider("Nhiệt độ màu", adjust.temperature, -60, 60, 1, (value) => setAdjust({ ...adjust, temperature: value }))}
                {slider("Làm mờ nhẹ", adjust.blur, 0, 60, 1, (value) => setAdjust({ ...adjust, blur: value }))}
                {slider("Phai màu (fade)", adjust.fade, 0, 60, 1, (value) => setAdjust({ ...adjust, fade: value }))}
                {slider("Tối góc (vignette)", adjust.vignette, 0, 80, 1, (value) => setAdjust({ ...adjust, vignette: value }))}
                {slider("Hạt phim (grain)", adjust.grain, 0, 80, 1, (value) => setAdjust({ ...adjust, grain: value }))}
                <div className="sm:col-span-2 flex gap-2">
                  <button className="button" onClick={() => commit({ adjust: { brightness: 106, contrast: 112, saturation: 116, temperature: 4, fade: 0, vignette: 8, grain: 0, blur: 0 } })}><Wand2 size={14} />Tự động cân chỉnh</button>
                  <button className="button" onClick={() => commit({ adjust: ADJUST, transform: TRANSFORM, overlays: [], boxes: [] })}><RotateCcw size={14} />Đặt lại tất cả</button>
                </div>
              </div>
            )}

            {panel === "preset" && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {PRESETS.map((preset) => (
                  <button key={preset.name} onClick={() => commit({ adjust: preset.adjust })} className="group overflow-hidden rounded-lg border border-[#e9e9f0] text-left transition hover:border-[#c9b8ee]">
                    <span className="block h-12 w-full" style={{ background: `linear-gradient(135deg, hsl(${268 + preset.adjust.temperature} ${30 + preset.adjust.saturation / 4}% ${42 + (preset.adjust.brightness - 100) / 3}%), hsl(${200 + preset.adjust.temperature} ${24 + preset.adjust.saturation / 5}% ${28 + (preset.adjust.contrast - 100) / 6}%))`, filter: `saturate(${preset.adjust.saturation}%) contrast(${preset.adjust.contrast}%)` }} />
                    <span className="block px-2 py-1.5 text-[11px] font-medium">{preset.name}</span>
                  </button>
                ))}
              </div>
            )}

            {panel === "crop" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-[11px] font-medium text-slate-600">Tỉ lệ khung</p>
                  <div className="flex flex-wrap gap-1.5">
                    {RATIOS.map((ratio) => (
                      <button key={ratio.id} onClick={() => { setExportPreset(ratio.id === "16:9" ? "thumb" : ratio.id === "9:16" ? "short" : ratio.id === "1:1" ? "avatar" : "source"); commit({ transform: { ...transform, ratio: ratio.id } }); }} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${transform.ratio === ratio.id ? "bg-[#7858d6] text-white" : "bg-[#f4f1fb] text-[#5f5a6e]"}`}>{ratio.label}</button>
                    ))}
                  </div>
                </div>
                {slider("Phóng to (zoom)", transform.zoom, 100, 300, 1, (value) => setTransform({ ...transform, zoom: value }), "%")}
                {slider("Dịch ngang", transform.offsetX, -50, 50, 1, (value) => setTransform({ ...transform, offsetX: value }))}
                {slider("Dịch dọc", transform.offsetY, -50, 50, 1, (value) => setTransform({ ...transform, offsetY: value }))}
                <div className="flex items-end gap-2">
                  <button className="button" onClick={() => commit({ transform: { ...transform, rotate: (transform.rotate + 90) % 360 } })}><RotateCw size={14} />Xoay 90°</button>
                  <button className="button" onClick={() => commit({ transform: { ...transform, flipH: !transform.flipH } })}><FlipHorizontal2 size={14} />Lật ngang</button>
                  <button className="button" onClick={() => commit({ transform: { ...transform, flipV: !transform.flipV } })}><FlipHorizontal2 size={14} className="-scale-y-100" />Lật dọc</button>
                </div>
                <p className="text-[11px] text-slate-500 sm:col-span-2">Mẹo: chọn 16:9 rồi xuất 1280x720 để có thumbnail đúng chuẩn YouTube; chọn 9:16 cho Shorts.</p>
              </div>
            )}

            {panel === "text" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button className="button button-primary" onClick={() => commit({ overlays: [...overlays, { id: uid(), text: "TIÊU ĐỀ LỚN", x: 50, y: 42, size: 62, color: "#ffffff", weight: 800, stroke: 26, chip: false, shadow: true }] })}><Type size={14} />Thêm chữ tiêu đề</button>
                  <button className="button" onClick={() => commit({ overlays: [...overlays, { id: uid(), text: "Phụ đề nhỏ", x: 50, y: 74, size: 30, color: "#ffe27a", weight: 600, stroke: 18, chip: true, shadow: false }] })}><Plus size={14} />Thêm phụ đề</button>
                </div>
                {overlays.map((overlay) => (
                  <div key={overlay.id} className="rounded-lg border border-[#eeeaf5] p-2.5">
                    <div className="mb-2 flex gap-2">
                      <input value={overlay.text} onChange={(event) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, text: event.target.value } : entry))} onBlur={() => commit({})} className="flex-1 text-[12px]" placeholder="Chữ trên ảnh" />
                      <input type="color" value={overlay.color} onChange={(event) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, color: event.target.value } : entry))} className="h-9 w-10 rounded border border-[#dfdfe8]" aria-label="Màu chữ" />
                      <button className="button" onClick={() => commit({ overlays: overlays.filter((entry) => entry.id !== overlay.id) })} aria-label="Xoá chữ"><Trash2 size={13} /></button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {slider("Cỡ chữ", overlay.size, 10, 120, 1, (value) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, size: value } : entry)))}
                      {slider("Độ dày nét viền", overlay.stroke, 0, 60, 1, (value) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, stroke: value } : entry)))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-600">
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={overlay.chip} onChange={(event) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, chip: event.target.checked } : entry))} className="accent-[#7858d6]" />Nền chip</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={overlay.shadow} onChange={(event) => setOverlays((current) => current.map((entry) => entry.id === overlay.id ? { ...entry, shadow: event.target.checked } : entry))} className="accent-[#7858d6]" />Đổ bóng</label>
                      <span className="text-slate-400">Kéo thả chữ trực tiếp trên khung preview</span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500">Nguyên tắc thumbnail: tối đa 4-5 từ, chữ có viền đậm, chừa góc dưới phải cho logo kênh.</p>
              </div>
            )}

            {panel === "privacy" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button className="button button-primary" onClick={() => commit({ boxes: [...boxes, { id: uid(), x: 34, y: 34, w: 24, h: 18 }] })}><Eraser size={14} />Thêm vùng che mờ</button>
                  <p className="text-[11px] text-slate-500">Che mặt người lạ, biển số xe, địa chỉ, số điện thoại — bắt buộc để không vi phạm quyền riêng tư.</p>
                </div>
                {boxes.map((box) => (
                  <div key={box.id} className="rounded-lg border border-[#eeeaf5] p-2.5">
                    <div className="mb-1.5 flex items-center justify-between"><span className="text-[11px] font-medium">Vùng che #{box.id.slice(-4)}</span><button className="button" onClick={() => commit({ boxes: boxes.filter((entry) => entry.id !== box.id) })}><Trash2 size={13} />Xoá</button></div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {slider("Vị trí ngang", box.x, 0, 90, 1, (value) => setBoxes((current) => current.map((entry) => entry.id === box.id ? { ...entry, x: value } : entry)), "%")}
                      {slider("Vị trí dọc", box.y, 0, 90, 1, (value) => setBoxes((current) => current.map((entry) => entry.id === box.id ? { ...entry, y: value } : entry)), "%")}
                      {slider("Rộng", box.w, 4, 90, 1, (value) => setBoxes((current) => current.map((entry) => entry.id === box.id ? { ...entry, w: value } : entry)), "%")}
                      {slider("Cao", box.h, 4, 90, 1, (value) => setBoxes((current) => current.map((entry) => entry.id === box.id ? { ...entry, h: value } : entry)), "%")}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel === "video" && (
              active?.kind === "video" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {slider("Điểm bắt đầu (giây)", trimStart, 0, Math.max(active.duration, 1), 0.1, (value) => { const next = Math.min(value, trimEnd > 0 ? trimEnd : active.duration); setTrimStart(next); seek(next); }, "s")}
                  {slider("Điểm kết thúc (giây)", trimEnd || active.duration, 0, Math.max(active.duration, 1), 0.1, (value) => setTrimEnd(value), "s")}
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-[11.5px] text-slate-600"><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} className="accent-[#7858d6]" />Tắt tiếng khi xuất</label>
                    <label className="flex items-center gap-2 text-[11.5px] text-slate-600">Bitrate
                      <select value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} className="py-1.5 text-[11.5px]"><option value={4}>4 Mbps (720p)</option><option value={8}>8 Mbps (1080p)</option><option value={16}>16 Mbps (1440p)</option><option value={30}>30 Mbps (4K)</option></select>
                    </label>
                    <span className="text-[11px] text-slate-500">Đoạn xuất: {clock(Math.max((trimEnd || active.duration) - trimStart, 0))}{kind === "short" && (trimEnd - trimStart > LIMITS.shortSeconds ? " · vượt 180s cho Shorts" : "")}</span>
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap gap-2">
                    <button className="button" onClick={() => { setTrimStart(0); setTrimEnd(Math.min(active.duration, 60)); }}><Scissors size={14} />Cắt 60s đầu (Shorts)</button>
                    <button className="button" onClick={() => { setTrimStart(0); setTrimEnd(Math.min(active.duration, LIMITS.shortSeconds)); }}><Scissors size={14} />Cắt tối đa 180s</button>
                    <button className="button" onClick={captureFrame}><Camera size={14} />Xuất thumbnail từ khung hiện tại</button>
                  </div>
                </div>
              ) : <p className="py-6 text-center text-[12px] text-slate-500">Chọn một video để dùng công cụ cắt ghép, bitrate và bắt khung hình.</p>
            )}

            {panel === "export" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Kích thước xuất</span>
                    <select value={exportPreset} onChange={(event) => setExportPreset(event.target.value)} className="w-full">{EXPORT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
                  </label>
                  <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Định dạng</span>
                    <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="w-full"><option value="image/jpeg">JPEG (nhẹ, khuyến nghị)</option><option value="image/webp">WebP (nhỏ hơn 30%)</option><option value="image/png">PNG (không nén mất dữ liệu)</option></select>
                  </label>
                </div>
                {slider("Chất lượng nén", quality, 40, 100, 1, (value) => setQuality(value), "%")}
                <div className="flex flex-wrap gap-2">
                  <button className="button button-primary" onClick={() => void handleExport()} disabled={!active || busy}>{busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}{active?.kind === "video" ? "Xuất video đã cắt" : "Xuất ảnh"}</button>
                  {exportInfo && <><button className="button" onClick={downloadExported}><Download size={14} />Tải {exportInfo.name}</button><CopyButton text={exportInfo.name} label="Copy tên file" compact /></>}
                </div>
                {exportInfo && (
                  <div className="rounded-lg border border-[#eeeaf5] bg-[#faf8fe] p-3 text-[11.5px]">
                    <p className="font-medium text-slate-700">Kết quả xuất: {exportInfo.width}x{exportInfo.height} · {(exportInfo.bytes / 1024).toFixed(0)}KB</p>
                    <p className={exportInfo.bytes > LIMITS.thumbBytes ? "mt-1 text-[#9d485a]" : "mt-1 text-emerald-700"}>
                      {exportInfo.bytes > LIMITS.thumbBytes ? `Vượt giới hạn 2MB của YouTube — giảm chất lượng xuống 80% hoặc dùng JPEG.` : "Đạt chuẩn dung lượng thumbnail YouTube (dưới 2MB)."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {panel === "policy" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Tiêu đề ({title.length}/{LIMITS.title})</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tiêu đề chứa từ khóa chính" className="w-full" />
                  </label>
                  <label className="mt-2 block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Mô tả ({description.length}/{LIMITS.description})</span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full" placeholder="150 ký tự đầu là phần hiển thị trước khi bấm Thêm…" />
                  </label>
                  <label className="mt-2 block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Tag ({report.tagBudget.used}/{report.tagBudget.limit} ký tự)</span>
                    <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="tag 1, tag 2, tên kênh" className="w-full" />
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Định dạng</span>
                      <select value={kind} onChange={(event) => setKind(event.target.value as ContentKind)} className="w-full"><option value="video">Video thường</option><option value="short">Shorts</option><option value="live">Livestream</option><option value="image">Ảnh/Community</option></select>
                    </label>
                    <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Danh mục</span>
                      <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full">{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={madeForKids} onChange={(event) => setMadeForKids(event.target.checked)} className="accent-[#7858d6]" />Dành cho trẻ em (COPPA)</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={paidPromotion} onChange={(event) => setPaidPromotion(event.target.checked)} className="accent-[#7858d6]" />Có nội dung trả phí</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={hasCaptions} onChange={(event) => setHasCaptions(event.target.checked)} className="accent-[#7858d6]" />Có phụ đề</label>
                  </div>
                </div>
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <div className="mb-2 flex items-center justify-between"><h4 className="text-[12px] font-semibold">Checklist tuân thủ</h4><span className="font-mono text-[11px] text-slate-500">{report.checklist.filter((entry) => entry.state === "pass").length}/{report.checklist.length} đạt</span></div>
                  <ul className="space-y-1">
                    {report.checklist.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2 text-[11.5px]">
                        <span className={entry.state === "pass" ? "text-emerald-600" : entry.state === "fail" ? "text-[#9d485a]" : "text-slate-400"}>{entry.state === "pass" ? <CheckCircle2 size={13} /> : entry.state === "fail" ? <AlertTriangle size={13} /> : <X size={13} />}</span>
                        <span className="flex-1">{entry.label}{entry.detail ? <em className="ml-1 not-italic text-slate-400">({entry.detail})</em> : null}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {report.findings.length > 0 && (
                  <ul className="space-y-1.5">
                    {report.findings.map((finding) => (
                      <li key={finding.id} className={`rounded-lg border p-2.5 text-[11.5px] ${finding.level === "blocker" ? "border-rose-200 bg-rose-50" : finding.level === "warning" ? "border-amber-200 bg-amber-50" : "border-[#eeeaf5] bg-[#faf8fe]"}`}>
                        <p className="font-semibold">{finding.area} · {finding.level === "blocker" ? "Lỗi chặn" : finding.level === "warning" ? "Cảnh báo" : "Gợi ý"}</p>
                        <p className="mt-0.5 text-slate-600">{finding.message}</p>
                        {finding.fix && <p className="mt-1 text-[#6f579c]">Cách sửa: {finding.fix}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {panel === "ai" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#e6dcfa] bg-[#f7f3ff] p-3">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#5c3fb0]"><Sparkles size={14} />Tiêu đề đề xuất (bấm để dùng)</h4>
                  <div className="space-y-1">
                    {assistant.titles.map((line) => (
                      <button key={line} onClick={() => setTitle(line)} className="block w-full rounded-md border border-transparent bg-white/70 px-2 py-1.5 text-left text-[11.5px] hover:border-[#c9b8ee]">{line}<span className="ml-1 font-mono text-[10px] text-slate-400">{line.length}/{LIMITS.title}</span></button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <div className="mb-1.5 flex items-center justify-between"><h4 className="text-[12px] font-semibold">Mô tả tối ưu + chương</h4><div className="flex gap-1.5"><CopyButton text={assistant.description} label="Copy" compact /><button className="button" onClick={() => setDescription(assistant.description)}>Áp dụng</button></div></div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[#faf8fe] p-2 font-mono text-[10.5px] text-slate-600">{assistant.description}</pre>
                </div>
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <div className="mb-1.5 flex items-center justify-between"><h4 className="text-[12px] font-semibold">Tag đã tối ưu ngân sách 500 ký tự</h4><button className="button" onClick={() => setTagText(assistant.tags.join(", "))}>Áp dụng</button></div>
                  <div className="flex flex-wrap gap-1">{assistant.tags.map((tag) => <span key={tag} className="rounded bg-[#f1ecfc] px-1.5 py-0.5 text-[10.5px] text-[#5f4a94]">{tag}</span>)}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#eeeaf5] p-3"><h4 className="mb-1.5 text-[12px] font-semibold">Kịch bản 15 giây đầu</h4><ul className="space-y-1 text-[11.5px] text-slate-600">{assistant.hooks.map((hook) => <li key={hook}>• {hook}</li>)}</ul></div>
                  <div className="rounded-lg border border-[#eeeaf5] p-3"><h4 className="mb-1.5 text-[12px] font-semibold">Brief thumbnail</h4><ul className="space-y-1 text-[11.5px] text-slate-600">{assistant.thumbnailBrief.map((line) => <li key={line}>• {line}</li>)}</ul></div>
                  <div className="rounded-lg border border-[#eeeaf5] p-3"><h4 className="mb-1.5 text-[12px] font-semibold">Khung giờ đăng (VN)</h4><ul className="space-y-1 text-[11.5px] text-slate-600">{assistant.publishWindows.map((line) => <li key={line}>• {line}</li>)}</ul></div>
                  <div className="rounded-lg border border-[#eeeaf5] p-3"><h4 className="mb-1.5 text-[12px] font-semibold">Từ khoá phát hiện</h4><div className="flex flex-wrap gap-1">{keywordsOf(`${title} ${description}`, 10).map((word) => <span key={word} className="rounded bg-[#f4f1fb] px-1.5 py-0.5 text-[10.5px]">{word}</span>)}</div></div>
                </div>
                <div className="rounded-lg border border-[#eeeaf5] p-3">
                  <div className="mb-1.5 flex items-center justify-between"><h4 className="text-[12px] font-semibold">Ghi chú đẩy sang YouTube Studio</h4><div className="flex gap-1.5"><CopyButton text={assistant.notes} label="Copy" compact /><button className="button" onClick={() => downloadText(`ghi-chu-youtube-${Date.now()}.txt`, assistant.notes)}><Download size={13} />Tải .txt</button></div></div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[#faf8fe] p-2 font-mono text-[10.5px] text-slate-600">{assistant.notes}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="editor-publish-sidebar">
          <div className="card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Đẩy sang YouTube Studio</h3>
            <form onSubmit={pushToYouTube} className="space-y-2">
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Chế độ hiển thị</span>
                <select value={privacy} onChange={(event) => setPrivacy(event.target.value)} className="w-full"><option value="private">Riêng tư</option><option value="unlisted">Không công khai</option><option value="public">Công khai</option></select>
              </label>
              <label className="block text-[11px] text-slate-600"><span className="mb-1 block font-medium">Lên lịch (để trống = đăng ngay)</span>
                <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="w-full" />
              </label>
              <button type="submit" className="button button-primary w-full" disabled={busy || !active}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}{data.channel ? "Kiểm tra & đẩy video" : "Tạo gói đăng + mở Studio"}</button>
              <p className="text-[10.5px] leading-relaxed text-slate-500">{data.channel ? `Đang đăng với kênh ${data.channel.title}. TubeFlow chặn đăng nếu còn lỗi vi phạm chính sách.` : "Chưa kết nối OAuth: TubeFlow chuẩn bị tiêu đề, mô tả, tag, ghi chú tối ưu rồi mở studio.youtube.com để bạn dán vào."}</p>
            </form>
          </div>
          <div className="card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Điểm tuân thủ</h3>
            <div className="mb-2 flex items-end gap-2"><span className="font-mono text-3xl font-semibold text-[#5c3fb0]">{report.score}</span><span className="mb-1 text-[11px] text-slate-500">/100 · hạng {report.grade}</span></div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-[#eeeaf5]"><span className={`block h-full rounded-full ${report.readyToPublish ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${report.score}%` }} /></div>
            <p className="text-[11px] text-slate-500">{report.blockers.length} lỗi chặn · {report.warnings.length} cảnh báo · {report.tips.length} gợi ý</p>
            <button className="button mt-2 w-full" onClick={() => setPanel("policy")}><ShieldCheck size={14} />Xem chi tiết<ArrowRight size={13} /></button>
          </div>
          <div className="card p-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lối tắt</h3>
            <div className="space-y-1.5">
              <button className="button w-full justify-start" onClick={() => onNavigate("studio")}><ClapperboardLike />YouTube Studio</button>
              <button className="button w-full justify-start" onClick={() => onNavigate("planner")}><CalendarLike />Đưa vào lịch nội dung</button>
              <button className="button w-full justify-start" onClick={() => onNavigate("strategy")}><TargetLike />Phân tích đối thủ</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const ClapperboardLike = () => <Upload size={14} />;
const CalendarLike = () => <ArrowRight size={14} />;
const TargetLike = () => <Sparkles size={14} />;
