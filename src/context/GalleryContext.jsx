import { createContext, useContext, useState, useCallback } from 'react'
import { initialGallery } from '../data/initialGallery.js'

const GalleryContext = createContext(null)
let nextId = 100

export function GalleryProvider({ children }) {
  const [results, setResults] = useState(initialGallery)

  const addResult = useCallback((result) => {
    nextId += 1
    setResults((prev) => [{ id: nextId, status: 'run', progress: 0, ...result }, ...prev])
  }, [])

  const approveResult = useCallback((id) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, approved: true } : r)))
  }, [])

  const retryResult = useCallback((id) => {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'run', progress: 0 } : r)))
  }, [])

  return (
    <GalleryContext.Provider value={{ results, addResult, approveResult, retryResult }}>
      {children}
    </GalleryContext.Provider>
  )
}

export function useGallery() {
  const ctx = useContext(GalleryContext)
  if (!ctx) throw new Error('useGallery must be used within GalleryProvider')
  return ctx
}
