import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import estrellas from "@/assets/estrellas.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finger Light ✨ — Draw with your hand" },
      {
        name: "description",
        content:
          "Draw on a canvas using just your finger and webcam. Mobile-friendly hand tracking art.",
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
  const [status, setStatus] = useState("Tap start to enable webcam");
  const [running, setRunning] = useState(false);
  const [drawMode, setDrawMode] = useState<"pinch" | "index">("pinch");

  // refs that hold latest values for the rAF loop
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  const modeRef = useRef(drawMode);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { modeRef.current = drawMode; }, [drawMode]);

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

  const start = async () => {
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
        numHands: 1,
        runningMode: "VIDEO",
      });
      landmarkerRef.current = landmarker;

      resizeCanvases();
      setRunning(true);
      setStatus("✨ Move your hand in front of the camera");
      loop();
    } catch (e: any) {
      setStatus("Camera blocked: " + (e?.message || e));
    }
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

        if (res.landmarks && res.landmarks[0]) {
          const lm = res.landmarks[0];
          // mirror x because video is mirrored
          const index = lm[8];
          const thumb = lm[4];
          const ix = (1 - index.x) * overlay.width;
          const iy = index.y * overlay.height;
          const tx = (1 - thumb.x) * overlay.width;
          const ty = thumb.y * overlay.height;

          const dist = Math.hypot(ix - tx, iy - ty);
          const pinchThreshold = Math.min(overlay.width, overlay.height) * 0.06;
          const drawing =
            modeRef.current === "index" ? true : dist < pinchThreshold;

          // cursor
          octx.beginPath();
          octx.arc(ix, iy, drawing ? 14 : 10, 0, Math.PI * 2);
          octx.fillStyle = drawing ? colorRef.current : "rgba(255,255,255,0.6)";
          octx.fill();
          octx.lineWidth = 3;
          octx.strokeStyle = "rgba(0,0,0,0.4)";
          octx.stroke();

          if (drawing) {
            const dpr = window.devicePixelRatio || 1;
            dctx.lineCap = "round";
            dctx.lineJoin = "round";
            dctx.strokeStyle = colorRef.current;
            dctx.lineWidth = sizeRef.current * dpr;
            if (lastPt.current) {
              dctx.beginPath();
              dctx.moveTo(lastPt.current.x, lastPt.current.y);
              dctx.lineTo(ix, iy);
              dctx.stroke();
            } else {
              dctx.beginPath();
              dctx.arc(ix, iy, (sizeRef.current * dpr) / 2, 0, Math.PI * 2);
              dctx.fillStyle = colorRef.current;
              dctx.fill();
            }
            lastPt.current = { x: ix, y: iy };
          } else {
            lastPt.current = null;
          }
        } else {
          lastPt.current = null;
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
      <div className="min-h-screen w-full bg-gradient-to-b from-white/10 via-white/20 to-white/40 backdrop-blur-[1px]">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
          <h1 className="truncate text-xl font-black tracking-tight sm:text-3xl"
              style={{ background: "var(--gradient-cute)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ✦ Finger Light ✦
          </h1>
          <div className="flex shrink-0 gap-2">
            {!running ? (
              <button
                onClick={start}
                className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow-soft)] active:scale-95"
                style={{ background: "var(--gradient-cute)" }}
              >
                ▶ Start
              </button>
            ) : (
              <>
                <button onClick={clear} className="rounded-full bg-white/80 px-3 py-2 text-sm font-semibold shadow-md active:scale-95">
                  Clear
                </button>
                <button onClick={save} className="rounded-full bg-white/80 px-3 py-2 text-sm font-semibold shadow-md active:scale-95">
                  Save
                </button>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-3 pb-24 sm:px-6">
          <div
            ref={wrapRef}
            className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border-2 border-white/70 bg-black/30 shadow-[var(--shadow-soft)] sm:aspect-video"
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
            {!running && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                <p className="rounded-2xl bg-white/85 px-5 py-3 text-sm font-medium text-foreground shadow-lg">
                  {status}
                </p>
              </div>
            )}
            {running && (
              <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
                {drawMode === "pinch" ? "pinch thumb + index to draw" : "index finger draws"}
              </div>
            )}
          </div>

          <section className="mt-5 rounded-3xl border-2 border-white/70 bg-white/70 p-4 shadow-[var(--shadow-soft)] backdrop-blur-md sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/70">Color</span>
              {swatches.map((s) => (
                <button
                  key={s.name}
                  aria-label={s.name}
                  onClick={() => setColor(s.color)}
                  className={`h-9 w-9 rounded-full border-2 shadow-md transition-transform active:scale-90 ${
                    color === s.color ? "border-foreground scale-110" : "border-white"
                  }`}
                  style={{ background: s.color }}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/70">Size</span>
              <input
                type="range"
                min={2}
                max={40}
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="flex-1 min-w-[140px] accent-[oklch(0.62_0.27_330)]"
              />
              <span className="w-8 text-center text-sm font-bold">{size}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="self-center text-xs font-bold uppercase tracking-wider text-foreground/70">Mode</span>
              {(["pinch", "index"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDrawMode(m)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                    drawMode === m
                      ? "text-white shadow-md"
                      : "bg-white/80 text-foreground"
                  }`}
                  style={
                    drawMode === m
                      ? { background: "var(--gradient-cute)" }
                      : undefined
                  }
                >
                  {m === "pinch" ? "👌 Pinch" : "☝️ Index"}
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
