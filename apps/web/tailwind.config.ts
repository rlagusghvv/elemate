import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mint: "#34d399",
        sand: "#f8f4ea",
        steel: "#475569",
      },
      boxShadow: {
        panel: "0 20px 60px -30px rgba(15, 23, 42, 0.45)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans KR'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(71,85,105,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.12) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
