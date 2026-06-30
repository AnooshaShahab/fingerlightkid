import { createFileRoute } from "@tanstack/react-router";
import estrellas from "@/assets/estrellas.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finger Light ✨" },
      { name: "description", content: "Draw in the air with your fingers — cute pastel edition." },
    ],
  }),
  component: Index,
});

const swatches = [
  { name: "pink", color: "var(--pink)" },
  { name: "coral", color: "var(--coral)" },
  { name: "peach", color: "var(--peach)" },
  { name: "butter", color: "var(--butter)" },
  { name: "mint", color: "var(--mint)" },
  { name: "sky", color: "var(--sky)" },
  { name: "lavender", color: "var(--lavender)" },
  { name: "white", color: "#ffffff" },
];

function Index() {
  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${estrellas.url})` }}
    >
      <div className="min-h-screen w-full backdrop-blur-[2px] bg-white/20">
        <header className="flex items-center justify-between px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground drop-shadow-sm">
            ✦ Finger Light ✦
          </h1>
          <span className="rounded-full bg-white/70 px-4 py-1 text-xs font-medium text-foreground shadow-[var(--shadow-soft)]">
            pinch ✿ to draw
          </span>
        </header>

        <main className="mx-auto max-w-5xl px-6 pb-16">
          <div
            className="rounded-3xl border-2 border-white/60 bg-white/30 p-2 shadow-[var(--shadow-soft)] backdrop-blur-md"
          >
            <div className="aspect-video rounded-2xl bg-white/40 flex items-center justify-center text-foreground/70 text-sm">
              ♡ your canvas lives here ♡
            </div>
          </div>

          <section className="mt-8 rounded-3xl border-2 border-white/60 bg-white/50 p-6 shadow-[var(--shadow-soft)] backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-foreground">Color</span>
              {swatches.map((s) => (
                <button
                  key={s.name}
                  aria-label={s.name}
                  className="h-9 w-9 rounded-full border-2 border-white shadow-md transition-transform hover:scale-110"
                  style={{ background: s.color }}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {["Pen", "Marker", "Watercolor", "Airbrush", "Neon", "Sparkle"].map((b, i) => (
                <button
                  key={b}
                  className="rounded-full px-4 py-2 text-sm font-medium text-foreground border-2 border-white/70 shadow-sm transition hover:-translate-y-0.5"
                  style={{
                    background:
                      i === 0
                        ? "var(--gradient-cute)"
                        : "color-mix(in oklab, white 70%, var(--lavender))",
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
