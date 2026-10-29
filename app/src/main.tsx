import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { entrypoints } from 'virtual:recommand-file-based-router'
import app from 'virtual:recommand-app'

// The favicon comes from the deployment's app identity (recommand.app).
if (app.favicon) {
  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = app.favicon
  document.head.appendChild(link)
}

const nestEntrypoints = (entrypoints: Array<React.ComponentType<{ children?: React.ReactNode }>>): React.ReactNode => {
  if (entrypoints.length === 0) return null;
  const First = entrypoints[0];
  const rest = entrypoints.slice(1);
  return (
    <First>
      {nestEntrypoints(rest)}
    </First>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {nestEntrypoints(entrypoints)}
    </ThemeProvider>
  </React.StrictMode>
)
