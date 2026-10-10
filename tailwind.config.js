/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        status: {
          pending: "#f59e0b",
          preparing: "#3b82f6",
          delivering: "#8b5cf6",
          delivered: "#10b981",
          cancelled: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
