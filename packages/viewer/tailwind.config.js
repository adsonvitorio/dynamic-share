/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "var(--base)",
          deep: "var(--base-deep)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          soft: "rgb(var(--brand-soft, var(--brand) / 0.14) / <alpha-value>)",
        },
        accent: "rgb(var(--accent) / <alpha-value>)",
        live: "rgb(var(--live) / <alpha-value>)",
        neon: "rgb(var(--neon, var(--brand)) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        content: "var(--text)",
        muted: "var(--text-muted)",
      },
      fontFamily: {
        sans: ["var(--font-body)"],
        display: ["var(--font-display)"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgb(var(--brand) / 0.45)",
        card: "0 8px 32px -12px rgb(0 0 0 / 0.5)",
      },
      transitionDuration: {
        theme: "var(--dur, 150ms)",
      },
      transitionTimingFunction: {
        theme: "var(--ease, ease-out)",
      },
    },
  },
  plugins: [],
};
