import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#00d4a1",
        danger: "#ff6b35",
      },
      fontFamily: {
        mono: ["'SF Mono'", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
