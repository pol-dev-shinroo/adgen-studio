import { NavigationProvider } from './NavigationContext.jsx'
import { AdsProvider } from './AdsContext.jsx'
import { GalleryProvider } from './GalleryContext.jsx'
import { ProductsProvider } from './ProductsContext.jsx'
import { StudioProvider } from './StudioContext.jsx'

// Composes every feature's context so App.jsx doesn't have to nest them manually.
export function AppProviders({ children }) {
  return (
    <NavigationProvider>
      <AdsProvider>
        <GalleryProvider>
          <ProductsProvider>
            <StudioProvider>
              {children}
            </StudioProvider>
          </ProductsProvider>
        </GalleryProvider>
      </AdsProvider>
    </NavigationProvider>
  )
}
