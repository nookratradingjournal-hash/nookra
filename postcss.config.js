import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  plugins: [
    tailwindcss({
      content: [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
      ],
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: { sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'] },
          colors: {
            surface: {
              0: '#080808',
              1: '#0f0f0f',
              2: '#161616',
              3: '#1e1e1e',
              4: '#2a2a2a',
            },
          },
        },
      },
      plugins: [],
    }),
    autoprefixer(),
  ],
}
