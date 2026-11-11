import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import { createRoot } from 'react-dom/client'
import App from './App'
import { boot } from './vault/connect'

createRoot(document.getElementById('root')!).render(<App />)
boot()
