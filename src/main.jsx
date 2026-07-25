import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Cafe24CallbackPage from './pages/Cafe24CallbackPage.jsx'
import './styles/global.css'

// Standalone route, deliberately outside <App/>'s Sidebar/Context tree — see
// Cafe24CallbackPage.jsx for why this exists (Cafe24 requires a real,
// publicly deployed HTTPS redirect URI for its OAuth flow; this is that URI).
const isCafe24Callback = window.location.pathname === '/cafe24-callback'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCafe24Callback ? <Cafe24CallbackPage /> : <App />}
  </React.StrictMode>
)
