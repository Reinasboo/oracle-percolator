module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        apex: '#00D9FF',
        sentinel: '#7C3AED',
        void: '#0A0E27',
        neon: '#FF006E',
        teal: '#14B8A6',
      },
      fontFamily: {
        display: ['Inter Tight', 'Syne', 'sans-serif'],
        body: ['Inter', 'Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'neon-lg': '0 8px 30px rgba(0, 217, 255, 0.25)',
      }
    }
  },
  plugins: [],
};
