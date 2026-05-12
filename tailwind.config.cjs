
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#1e293b', // Custom dark shade
          900: '#0f172a',
          950: '#020617',
        }
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'zoom-in-95': {
          '0%': { opacity: '0', transform: 'scale(.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-from-bottom-5': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-from-right-10': {
          '0%': { transform: 'translateX(40px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-right-2': {
            '0%': { transform: 'translateX(8px)', opacity: '0' },
            '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-top-1': {
            '0%': { transform: 'translateY(-4px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
        },
         'slide-in-from-top-2': {
            '0%': { transform: 'translateY(-8px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
        },
         'slide-in-from-left-2': {
            '0%': { transform: 'translateX(-8px)', opacity: '0' },
            '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'in': 'fade-in 0.5s ease-out',
        'in-fast': 'fade-in 0.2s ease-out',
        'zoom-in-95': 'zoom-in-95 0.2s ease-out',
        'slide-in-from-bottom-5': 'slide-in-from-bottom-5 0.3s ease-out',
        'slide-in-from-right-10': 'slide-in-from-right-10 0.3s ease-out',
        'slide-in-from-right-2': 'slide-in-from-right-2 0.3s ease-out',
        'slide-in-from-top-1': 'slide-in-from-top-1 0.2s ease-out',
        'slide-in-from-top-2': 'slide-in-from-top-2 0.2s ease-out',
        'slide-in-from-left-2': 'slide-in-from-left-2 0.3s ease-out',
      },
    },
  },
  plugins: [
      require('tailwindcss-animate')
  ],
}
