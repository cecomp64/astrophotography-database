/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          900: '#0a0a1a',
          800: '#12122b',
          700: '#1a1a3c',
          600: '#22224d',
        },
      },
    },
  },
  plugins: [],
}
