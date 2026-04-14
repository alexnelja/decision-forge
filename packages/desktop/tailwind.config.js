/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#0a0a0a",
          panel: "#111113",
          border: "#1f1f22",
          accent: "#6366f1",
          mc: "#22d3ee",
          nego: "#f59e0b",
          forecast: "#10b981"
        }
      }
    }
  },
  plugins: []
};
