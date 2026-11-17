import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Montserrat is bundled (not loaded from Google Fonts) so the packaged webOS app works offline.
import '@fontsource/montserrat/latin-300.css'
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import App from './App'
import { applyPalette } from './theme'
import './styles.css'

applyPalette()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
