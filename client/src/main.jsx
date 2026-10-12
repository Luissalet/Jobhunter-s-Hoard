import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { installCopilot } from './copilot-context.js';

installCopilot();   // window.hoardCopilot: what the Faustus panel reads from this app

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
