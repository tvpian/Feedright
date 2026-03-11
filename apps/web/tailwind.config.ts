import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — rich forest green
        brand: {
          50:  "#edfcf2",
          100: "#d3f8e0",
          200: "#aaf0c4",
          300: "#73e2a3",
          400: "#3acb7d",
          500: "#16b05e",
          600: "#0c8f4a",   // primary action colour
          700: "#0a7140",
          800: "#0b5a35",
          900: "#0a4a2d",
          950: "#052e1c",
        },
        // Warm off-white surfaces
        surface: {
          DEFAULT: "#F7F6F2",
          card:    "#FFFFFF",
          muted:   "#F0EFE9",
          border:  "rgba(0,0,0,0.07)",
        },
        // Semantic macro colours
        macro: {
          cal:     "#7c3aed",   // violet — calories
          protein: "#0ea5e9",   // sky   — protein
          carbs:   "#f59e0b",   // amber — carbs
          fat:     "#10b981",   // emerald — fat
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
        "4xl": "1.75rem",
      },
      boxShadow: {
        card:   "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
        "card-hover": "0 2px 8px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.07)",
        glass:  "0 4px 24px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)",
        glow:   "0 0 0 3px rgba(12,143,74,0.2)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "brand-gradient":    "linear-gradient(135deg, #0c8f4a 0%, #16b05e 100%)",
        "brand-gradient-r":  "linear-gradient(135deg, #16b05e 0%, #0a7140 100%)",
        "surface-gradient":  "linear-gradient(180deg, #F7F6F2 0%, #EDECE7 100%)",
      },
      animation: {
        "fade-in":    "fadeIn 0.2s ease-out",
        "slide-up":   "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)",
        "scale-in":   "scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)",
      },
      keyframes: {
        fadeIn:   { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:  { from: { transform: "translateY(12px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        scaleIn:  { from: { transform: "scale(0.95)", opacity: "0" }, to: { transform: "scale(1)", opacity: "1" } },
      },
    },
  },
  plugins: [],
};
export default config;
