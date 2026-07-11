/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "../nodes/**/*.{js,json,md}"
  ],
  theme: {
    extend: {
      keyframes: {
        "marquee-right": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" }
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "marquee-right": "marquee-right 28s linear infinite",
        "fade-in": "fade-in 0.6s ease-out both",
        "slide-up": "slide-up 0.5s ease-out both"
      }
    }
  },
  plugins: []
};
