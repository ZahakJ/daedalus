import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initRouter } from './router.ts';

initRouter();
createRoot(document.getElementById('root')!).render(<App />);
