import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import './index.css'
import App from './App.tsx'
import { CONVEX_URL } from './config/convex.ts'

const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(
  CONVEX_URL ? (
    <ConvexProvider client={new ConvexReactClient(CONVEX_URL)}>
      {app}
    </ConvexProvider>
  ) : app,
)
