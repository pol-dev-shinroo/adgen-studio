import { NavigationProvider } from './NavigationContext.jsx'
import { AdsProvider } from './AdsContext.jsx'
import { GalleryProvider } from './GalleryContext.jsx'
import { ProductsProvider } from './ProductsContext.jsx'
import { StudioProvider } from './StudioContext.jsx'
import { AIStudioProvider } from './AIStudioContext.jsx'

// Composes every feature's context so App.jsx doesn't have to nest them manually.
// Part EE: AIStudioProvider needs useAds()/useProducts()/useGallery() (the
// same three StudioProvider already needs), so it's nested inside all three
// here too, alongside StudioProvider — order between the two doesn't matter,
// neither reads from the other.
export function AppProviders({ children }) {
  return (
    <NavigationProvider>
      <AdsProvider>
        <GalleryProvider>
          <ProductsProvider>
            <StudioProvider>
              <AIStudioProvider>
                {children}
              </AIStudioProvider>
            </StudioProvider>
          </ProductsProvider>
        </GalleryProvider>
      </AdsProvider>
    </NavigationProvider>
  )
}
