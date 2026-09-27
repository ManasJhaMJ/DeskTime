import './flags'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/manrope'
import App from './App'
import Popup from './Popup'
import './index.css'

const isPopup = new URLSearchParams(window.location.search).has('popup')
if (isPopup) document.documentElement.classList.add('popup')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPopup ? <Popup /> : <App />}</React.StrictMode>
)
