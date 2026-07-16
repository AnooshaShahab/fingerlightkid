import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import estrellas from "@/assets/estrellas.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finger Light — Draw with your hand" },
      {
        name: "description",
        content:
          "Draw on a canvas using just your hand and webcam. Mobile-friendly full hand tracking art.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
  component: Index,
});

const swatches = [
  { name: "hot pink", color: "oklch(0.68 0.25 0)" },
  { name: "magenta", color: "oklch(0.62 0.27 330)" },
  { name: "purple", color: "oklch(0.6 0.24 300)" },
  { name: "indigo", color: "oklch(0.55 0.22 270)" },
  { name: "sky", color: "oklch(0.7 0.2 230)" },
  { name: "teal", color: "oklch(0.7 0.18 190)" },
  { name: "mint", color: "oklch(0.78 0.2 155)" },
  { name: "lime", color: "oklch(0.82 0.24 130)" },
  { name: "butter", color: "oklch(0.88 0.2 95)" },
  { name: "orange", color: "oklch(0.75 0.22 55)" },
  { name: "coral", color: "oklch(0.7 0.24 25)" },
  { name: "red", color: "oklch(0.62 0.26 15)" },
  { name: "white", color: "#ffffff" },
  { name: "black", color: "#1a1a2e" },
];

type Brush = "pen" | "marker" | "watercolor" | "airbrush" | "neon" | "sparkle";
const brushes: Brush[] = ["pen", "marker", "watercolor", "airbrush", "neon", "sparkle"];

interface Prompt {
  text: string;
  color: string;
  brush: Brush;
  size: number;
}

const drawingPrompts: Prompt[] = [
  { text: "Draw a rainbow", color: swatches[0].color, brush: "watercolor", size: 12 },
  { text: "Make a smiley", color: swatches[13].color, brush: "marker", size: 10 },
  { text: "Draw a tree", color: swatches[6].color, brush: "pen", size: 8 },
  { text: "Draw a sun", color: swatches[9].color, brush: "neon", size: 14 },
  { text: "Draw your name", color: swatches[2].color, brush: "sparkle", size: 10 },
  { text: "Draw a house", color: swatches[3].color, brush: "pen", size: 8 },
];

// MediaPipe hand connections (pairs of landmark indices)
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function Index() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  const [color, setColor] = useState(swatches[0].color);
  const [size, setSize] = useState(8);
  const [status, setStatus] = useState("Allow camera to start drawing");
  const [running, setRunning] = useState(false);
  const [drawMode, setDrawMode] = useState<"pinch" | "index">("pinch");
  const [brush, setBrush] = useState<Brush>("pen");
  // 0 strict (fingers must nearly touch) → 100 loose (easy trigger)
  const [sensitivity, setSensitivity] = useState(50);
  // 0 raw (jittery) → 100 very smooth (slight lag)
  const [smoothing, setSmoothing] = useState(55);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);

  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const modeRef = useRef(drawMode);
  const brushRef = useRef(brush);
  const sensRef = useRef(sensitivity);
  const smoothRef = useRef(smoothing);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { modeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { sensRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { smoothRef.current = smoothing; }, [smoothing]);

  const smoothedPt = useRef<{ x: number; y: number } | null>(null);
  const pinchHoldRef = useRef(false);
  const promptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resizeCanvases = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!wrap || !canvas || !overlay) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    [canvas, overlay].forEach((c) => {
      const prev = document.createElement("canvas");
      prev.width = c.width;
      prev.height = c.height;
      const pctx = prev.getContext("2d");
      if (pctx && c.width > 0) pctx.drawImage(c, 0, 0);
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      if (c === canvas && prev.width > 0) {
        const ctx = c.getContext("2d");
        ctx?.drawImage(prev, 0, 0, c.width, c.height);
      }
    });
  }, []);

  useEffect(() => {
    resizeCanvases();
    const onResize = () => resizeCanvases();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [resizeCanvases]);

  const start = useCallback(async () => {
    try {
      setStatus("Requesting camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus("Loading hand tracker…");
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );
      const landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        numHands: 2,
        runningMode: "VIDEO",
      });
      landmarkerRef.current = landmarker;

      resizeCanvases();
      setRunning(true);
      setStatus("");
      loop();
    } catch (e: any) {
      setStatus("Camera blocked: " + (e?.message || e));
    }
  }, [resizeCanvases]);

  // auto-start on mount
  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strokeSegment = (
    dctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const dpr = window.devicePixelRatio || 1;
    const w = sizeRef.current * dpr;
    const col = colorRef.current;
    dctx.save();
    dctx.lineCap = "round";
    dctx.lineJoin = "round";

    switch (brushRef.current) {
      case "pen": {
        dctx.globalAlpha = 1;
        dctx.strokeStyle = col;
        dctx.lineWidth = w * 0.5;
        dctx.beginPath();
        dctx.moveTo(from.x, from.y);
        dctx.lineTo(to.x, to.y);
        dctx.stroke();
        break;
      }
      case "marker": {
        dctx.globalAlpha = 0.6;
        dctx.strokeStyle = col;
        dctx.lineWidth = w * 1.5;
        dctx.beginPath();
        dctx.moveTo(from.x, from.y);
        dctx.lineTo(to.x, to.y);
        dctx.stroke();
        break;
      }
      case "watercolor": {
        dctx.globalAlpha = 0.18;
        dctx.strokeStyle = col;
        for (let i = 0; i < 4; i++) {
          dctx.lineWidth = w * (1.2 + i * 0.6);
          dctx.beginPath();
          dctx.moveTo(from.x + (Math.random() - 0.5) * w, from.y + (Math.random() - 0.5) * w);
          dctx.lineTo(to.x + (Math.random() - 0.5) * w, to.y + (Math.random() - 0.5) * w);
          dctx.stroke();
        }
        break;
      }
      case "airbrush": {
        dctx.globalAlpha = 0.08;
        dctx.fillStyle = col;
        const r = w * 2.2;
        const steps = 14;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = from.x + (to.x - from.x) * t;
          const y = from.y + (to.y - from.y) * t;
          for (let j = 0; j < 6; j++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.random() * r;
            dctx.beginPath();
            dctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.5, 0, Math.PI * 2);
            dctx.fill();
          }
        }
        break;
      }
      case "neon": {
        dctx.globalAlpha = 1;
        dctx.shadowBlur = w * 2;
        dctx.shadowColor = col;
        dctx.strokeStyle = "#ffffff";
        dctx.lineWidth = w * 0.6;
        dctx.beginPath();
        dctx.moveTo(from.x, from.y);
        dctx.lineTo(to.x, to.y);
        dctx.stroke();
        dctx.strokeStyle = col;
        dctx.lineWidth = w * 1.2;
        dctx.globalAlpha = 0.5;
        dctx.stroke();
        break;
      }
      case "sparkle": {
        dctx.globalAlpha = 0.9;
        dctx.fillStyle = col;
        const count = 6;
        for (let i = 0; i < count; i++) {
          const t = Math.random();
          const x = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * w * 2;
          const y = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * w * 2;
          const s = Math.random() * w * 0.6 + 1;
          // 4-point star
          dctx.beginPath();
          dctx.moveTo(x, y - s);
          dctx.lineTo(x + s * 0.3, y - s * 0.3);
          dctx.lineTo(x + s, y);
          dctx.lineTo(x + s * 0.3, y + s * 0.3);
          dctx.lineTo(x, y + s);
          dctx.lineTo(x - s * 0.3, y + s * 0.3);
          dctx.lineTo(x - s, y);
          dctx.lineTo(x - s * 0.3, y - s * 0.3);
          dctx.closePath();
          dctx.fill();
        }
        break;
      }
    }
    dctx.restore();
  };

  const loop = () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !overlay || !canvas || !landmarker) return;

    const octx = overlay.getContext("2d")!;
    const dctx = canvas.getContext("2d")!;

    const tick = () => {
      if (video.readyState >= 2) {
        const ts = performance.now();
        const res = landmarker.detectForVideo(video, ts);
        octx.clearRect(0, 0, overlay.width, overlay.height);

        if (res.landmarks && res.landmarks.length > 0) {
          for (let h = 0; h < res.landmarks.length; h++) {
            const lm = res.landmarks[h];
            const pts = lm.map((p: any) => ({
              x: (1 - p.x) * overlay.width,
              y: p.y * overlay.height,
            }));

            // full hand skeleton — thin white lines, small white joints, red fingertips
            octx.lineWidth = 2;
            octx.strokeStyle = "rgba(255,255,255,0.9)";
            octx.shadowBlur = 4;
            octx.shadowColor = "rgba(0,0,0,0.6)";
            for (const [a, b] of HAND_CONNECTIONS) {
              octx.beginPath();
              octx.moveTo(pts[a].x, pts[a].y);
              octx.lineTo(pts[b].x, pts[b].y);
              octx.stroke();
            }
            octx.shadowBlur = 0;
            const fingertips = new Set([4, 8, 12, 16, 20]);
            for (let i = 0; i < pts.length; i++) {
              const isTip = fingertips.has(i);
              octx.beginPath();
              octx.arc(pts[i].x, pts[i].y, isTip ? 5 : 3, 0, Math.PI * 2);
              octx.fillStyle = isTip ? "#ff2d4a" : "rgba(255,255,255,0.95)";
              octx.fill();
            }

            // only the first hand draws
            if (h === 0) {
              const index = pts[8];
              const thumb = pts[4];
              // normalize pinch distance by hand size (wrist→index-MCP)
              const handSize =
                Math.hypot(pts[0].x - pts[5].x, pts[0].y - pts[5].y) || 1;
              const pinchRatio = Math.hypot(index.x - thumb.x, index.y - thumb.y) / handSize;
              // sensitivity 0..100 → threshold 0.15..0.95 (loose = bigger)
              const sens = sensRef.current / 100;
              const onThresh = 0.15 + sens * 0.6;        // start drawing
              const offThresh = onThresh + 0.12;          // stop drawing (hysteresis)

              let drawing: boolean;
              if (modeRef.current === "index") {
                drawing = true;
              } else {
                if (pinchHoldRef.current) {
                  drawing = pinchRatio < offThresh;
                } else {
                  drawing = pinchRatio < onThresh;
                }
                pinchHoldRef.current = drawing;
              }

              // smoothing (EMA): 0 → 1 (raw), 100 → ~0.12 (very smooth)
              const alpha = 1 - (smoothRef.current / 100) * 0.88;
              // anchor draw point between thumb & index in pinch mode for accuracy
              const target =
                modeRef.current === "pinch"
                  ? { x: (index.x + thumb.x) / 2, y: (index.y + thumb.y) / 2 }
                  : index;
              if (!smoothedPt.current) smoothedPt.current = { x: target.x, y: target.y };
              const sp = smoothedPt.current;
              sp.x = sp.x + (target.x - sp.x) * alpha;
              sp.y = sp.y + (target.y - sp.y) * alpha;
              const draw = { x: sp.x, y: sp.y };

              // cursor ring
              octx.beginPath();
              octx.arc(draw.x, draw.y, drawing ? 16 : 12, 0, Math.PI * 2);
              octx.lineWidth = 3;
              octx.strokeStyle = drawing ? colorRef.current : "rgba(255,255,255,0.8)";
              octx.stroke();

              if (drawing) {
                const dpr = window.devicePixelRatio || 1;
                if (lastPt.current) {
                  strokeSegment(dctx, lastPt.current, draw);
                } else {
                  dctx.save();
                  dctx.fillStyle = colorRef.current;
                  dctx.beginPath();
                  dctx.arc(draw.x, draw.y, (sizeRef.current * dpr) / 2, 0, Math.PI * 2);
                  dctx.fill();
                  dctx.restore();
                }
                lastPt.current = { x: draw.x, y: draw.y };
              } else {
                lastPt.current = null;
              }
            }
          }
        } else {
          lastPt.current = null;
          smoothedPt.current = null;
          pinchHoldRef.current = false;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.download = "fingerlight.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (promptTimeoutRef.current) clearTimeout(promptTimeoutRef.current);
      const v = videoRef.current;
      if (v && v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, []);


  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${estrellas.url})` }}
    >
      <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[color:var(--pink)]/40 via-[color:var(--lavender)]/30 to-[color:var(--sky)]/40 backdrop-blur-[1px]">
        {/* floating candy blobs */}
        <div className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-[color:var(--hotpink)]/40 blur-3xl animate-float-blob" />
        <div className="pointer-events-none absolute right-[-60px] top-40 h-80 w-80 rounded-full bg-[color:var(--lime)]/40 blur-3xl animate-float-blob" style={{ animationDelay: "2s" }} />
        <div className="pointer-events-none absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[color:var(--butter)]/50 blur-3xl animate-float-blob" style={{ animationDelay: "4s" }} />

        <header className="relative flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
          <h1 className="display flex items-center gap-2 truncate text-2xl text-foreground drop-shadow-[2px_2px_0_white] sm:text-4xl">
            Finger Light
          </h1>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={clear}
              className="rounded-full border-4 border-foreground bg-[color:var(--butter)] px-4 py-2 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--foreground)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Clear
            </button>
            <button
              onClick={save}
              className="rounded-full border-4 border-foreground bg-[color:var(--mint)] px-4 py-2 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--foreground)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Save
            </button>
          </div>
        </header>

        <main className="relative mx-auto max-w-5xl px-3 pb-24 sm:px-6">
          <div
            ref={wrapRef}
            className="relative aspect-[3/4] w-full overflow-hidden rounded-[2.5rem] border-[6px] border-foreground bg-black/30 shadow-[8px_8px_0_0_var(--foreground)] sm:aspect-video"
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            {!running && status && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <p className="rounded-3xl border-4 border-foreground bg-white px-6 py-4 text-base font-bold text-foreground shadow-[4px_4px_0_0_var(--foreground)]">
                  {status}
                </p>
              </div>
            )}
            {running && (
              <div className="absolute left-3 top-3 rounded-full border-2 border-white bg-[color:var(--hotpink)] px-3 py-1 text-xs font-bold text-white shadow-md">
                {drawMode === "pinch" ? "pinch to draw" : "fingertip draws"} · {brush}
              </div>
            )}
            {activePrompt && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border-4 border-foreground bg-[color:var(--hotpink)] px-6 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--foreground)]">
                {activePrompt}
              </div>
            )}
          </div>

          <section className="mt-5 rounded-[2rem] border-[5px] border-foreground bg-white/90 p-4 shadow-[6px_6px_0_0_var(--foreground)] backdrop-blur-md sm:p-6">
            <p className="display mb-3 text-sm text-foreground">What should you draw?</p>
            <div className="flex flex-wrap gap-2">
              {drawingPrompts.map((p) => (
                <button
                  key={p.text}
                  onClick={() => {
                    clear();
                    setColor(p.color);
                    setBrush(p.brush);
                    setSize(p.size);
                    setActivePrompt(p.text);
                    if (promptTimeoutRef.current) clearTimeout(promptTimeoutRef.current);
                    promptTimeoutRef.current = setTimeout(() => setActivePrompt(null), 4000);
                  }}
                  className="rounded-full border-[3px] border-foreground bg-[color:var(--butter)] px-4 py-2 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--foreground)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none hover:-translate-y-0.5"
                >
                  {p.text}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-[2rem] border-[5px] border-foreground bg-white/90 p-4 shadow-[6px_6px_0_0_var(--foreground)] backdrop-blur-md sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="display text-sm text-foreground">Colors</span>
              {swatches.map((s) => (
                <button
                  key={s.name}
                  aria-label={s.name}
                  onClick={() => setColor(s.color)}
                  className={`h-10 w-10 rounded-full border-[3px] transition-transform active:scale-90 ${
                    color === s.color
                      ? "border-foreground scale-125 shadow-[2px_2px_0_0_var(--foreground)]"
                      : "border-white shadow-md hover:scale-110"
                  }`}
                  style={{ background: s.color }}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="display self-center text-sm text-foreground">Brush</span>
              {brushes.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrush(b)}
                  className={`rounded-full border-[3px] border-foreground px-4 py-2 text-sm font-bold capitalize transition active:scale-95 ${
                    brush === b
                      ? "bg-[color:var(--hotpink)] text-white shadow-[3px_3px_0_0_var(--foreground)]"
                      : "bg-[color:var(--butter)] text-foreground hover:-translate-y-0.5"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="display text-sm text-foreground">Size</span>
              <input
                type="range"
                min={2}
                max={40}
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="flex-1 min-w-[140px] accent-[color:var(--hotpink)]"
              />
              <span className="display w-10 rounded-full border-2 border-foreground bg-[color:var(--lime)] text-center text-sm">{size}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="display text-sm text-foreground" title="How easily a pinch is detected.">
                Pinch
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value))}
                disabled={drawMode === "index"}
                className="flex-1 min-w-[140px] accent-[color:var(--magenta)] disabled:opacity-40"
              />
              <span className="display w-10 rounded-full border-2 border-foreground bg-[color:var(--sky)] text-center text-sm">{sensitivity}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="display text-sm text-foreground" title="Smooths shaky tracking.">
                Smooth
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={smoothing}
                onChange={(e) => setSmoothing(parseInt(e.target.value))}
                className="flex-1 min-w-[140px] accent-[color:var(--teal)]"
              />
              <span className="display w-10 rounded-full border-2 border-foreground bg-[color:var(--mint)] text-center text-sm">{smoothing}</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="display self-center text-sm text-foreground">Mode</span>
              {(["pinch", "index"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDrawMode(m)}
                  className={`rounded-full border-[3px] border-foreground px-4 py-2 text-sm font-bold capitalize transition active:scale-95 ${
                    drawMode === m
                      ? "bg-[color:var(--purple)] text-white shadow-[3px_3px_0_0_var(--foreground)]"
                      : "bg-[color:var(--pink)] text-foreground hover:-translate-y-0.5"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </section>

          <p className="display mt-6 text-center text-sm text-foreground/80">
            Designed & Developed by Anusha Shahab
          </p>
        </main>
      </div>
    </div>
  );
}
