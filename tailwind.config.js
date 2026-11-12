/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        michroma: ['"Michroma"', '"Eurostile Extended"', '"Microgramma"', 'sans-serif'],
        cluster: ['"Michroma"', '"Eurostile Extended"', '"Microgramma"', 'sans-serif'],
        fjalla: ['"Fjalla One"', '"DIN Alternate"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
