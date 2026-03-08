import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { entrypoints } from 'virtual:recommand-file-based-router'

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
