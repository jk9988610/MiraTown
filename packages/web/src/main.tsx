import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { App } from './App';
import { MapEditorPage } from './pages/MapEditorPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/editor" element={<MapEditorPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
