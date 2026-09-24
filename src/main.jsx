import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './ThemeContext'

if (!import.meta.env.DEV) {
  axios.defaults.baseURL = 'https://empletteapi.aris-cc.com'
}
axios.defaults.withCredentials = true

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
