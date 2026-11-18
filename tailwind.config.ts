import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#1b1917",
          800: "#211f1d",
          700: "#262421",
          600: "#2e2b28",
          500: "#373430",
          400: "#4a4642",
        },
        cream: {
          100: "#e8e6e3",
          300: "#c8c5c1",
          500: "#a09d99",
          600: "#7d7a76",
        },
        accent: {
          DEFAULT: "#81b64c",
          hover: "#8fc75a",
          dark: "#3d5a27",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      keyframes: {
        "reaction-pop": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "60%": { transform: "scale(1.25)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "reaction-pop": "reaction-pop 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
