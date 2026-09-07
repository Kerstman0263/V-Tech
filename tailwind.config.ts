import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Saldova huisstijl — modern paars/violet, afgestemd op het S-logo (brand-600 = #7c3aed).
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
        // Premium donkere tinten — diep, bijna-zwart met een subtiele paarse
        // ondertoon. Geeft een luxe, rustige uitstraling (ipv hard zwart).
        ink: {
          800: "#1a1830", // hover-oppervlak
          900: "#0f0e1c", // hoofd-donker
          950: "#0b0a14", // diepste laag
        },
        // High-end dark theme — pagina-achtergrond + kaart/paneel-vlak.
        surface: "#080711", // diepste pagina-achtergrond
        panel: "#0f0e22", // kaarten & dashboard-panelen
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        // Subtiele paarse gloed voor actieve items en primaire CTA's
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
        "loading-bar": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "fade-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        // Tekent de S van boven naar beneden (pathLength=100 op het pad)
        "s-draw": {
          "0%": { strokeDashoffset: "100" },
          "60%, 100%": { strokeDashoffset: "0" },
        },
      },
      animation: {
        "logo-pulse": "logo-pulse 1.4s ease-in-out infinite",
        "loading-bar": "loading-bar 1.3s ease-in-out infinite",
        "fade-pulse": "fade-pulse 1.6s ease-in-out infinite",
        "s-draw": "s-draw 1.6s ease-in-out infinite",
        "aurora-a": "aurora-a 22s ease-in-out infinite",
        "aurora-b": "aurora-b 28s ease-in-out infinite",
        rise: "rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 2.4s ease-in-out 0.4s both",
        beacon: "beacon 2s ease-out infinite",
        "fade-in-up": "fade-in-up 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
