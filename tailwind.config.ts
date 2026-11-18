import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Saldova binnen Ova: violet, afgestemd op het Ova-ei van Saldova (brand-600 = #7c3aed).
        // Via CSS-variabelen (globals.css): het zzp-paneel is paars, het
        // bedrijfspaneel (data-panel="bedrijf") teal — zonder dat componenten
        // iets hoeven te weten. Standaard = paars (#7c3aed = brand-600).
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        // Donkere tinten voor bestaande klassen (ink-*). Nieuwe code gebruikt
        // liever de vaste Ova-tokens hieronder (grond, kaart, rand).
        ink: {
          800: "#1a1830", // hover-oppervlak
          900: "#0f0e1c", // hoofd-donker
          950: "#0b0a14", // diepste laag
        },
        // Vaste Ova-huisstijl, los van --brand (kleurt dus NIET mee met het paneel).
        // Pakketten gebruiken exact deze namen: bg-grond, bg-kaart, border-rand,
        // text-saldova-licht, text-tekst-gedempt.
        saldova: { DEFAULT: "#7C3AED", licht: "#a78bfa" },
        grond: "#0b0f14", // pagina-achtergrond (donkere Ova-grond)
        kaart: "#11161d", // kaarten en panelen
        rand: "#1f2937", // zachte rand
        "tekst-gedempt": "#94a3b8",
        // Oudere namen, zelfde kleuren als grond/kaart zodat bestaande klassen meekleuren.
        surface: "#0b0f14",
        panel: "#11161d",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        // Subtiele gloed in de paneelkleur voor actieve items
        glow: "0 0 15px rgb(var(--brand-600) / 0.15)",
        "glow-md": "0 0 20px rgb(var(--brand-600) / 0.30)",
        "glow-lg": "0 0 35px rgb(var(--brand-600) / 0.35)",
      },
      keyframes: {
        "logo-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.08)", opacity: "0.92" },
        },
        // Langzaam driftende aurora-vlekken achter het dashboard.
        "aurora-a": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(6%,-4%,0) scale(1.12)" },
          "66%": { transform: "translate3d(-4%,3%,0) scale(0.94)" },
        },
        "aurora-b": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "50%": { transform: "translate3d(-7%,5%,0) scale(0.92)" },
        },
        // Kaarten die bij het laden zacht omhoog invliegen (staggered).
        rise: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Glans die één keer over een oppervlak trekt.
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        // Zachte "live"-hartslag voor statusstippen.
        beacon: {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "70%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        // Hero-mockup schuift elegant omhoog terwijl hij invaart.
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(48px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Logo-/koppelingenband die eindeloos naar links schuift.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        // Zwevende kaartjes rond de hero-mockup.
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "loading-bar": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "fade-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "logo-pulse": "logo-pulse 1.4s ease-in-out infinite",
        "loading-bar": "loading-bar 1.3s ease-in-out infinite",
        "fade-pulse": "fade-pulse 1.6s ease-in-out infinite",
        "aurora-a": "aurora-a 22s ease-in-out infinite",
        "aurora-b": "aurora-b 28s ease-in-out infinite",
        rise: "rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 2.4s ease-in-out 0.4s both",
        beacon: "beacon 2s ease-out infinite",
        marquee: "marquee 38s linear infinite",
        float: "float 6s ease-in-out infinite",
        "fade-in-up": "fade-in-up 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
