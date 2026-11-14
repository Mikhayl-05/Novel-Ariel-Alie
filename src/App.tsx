import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ReaderPage } from './pages/ReaderPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ReaderPage />} />
        <Route path="/chapter/:chapterId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
