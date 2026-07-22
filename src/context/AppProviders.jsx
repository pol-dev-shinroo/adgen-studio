import { NavigationProvider } from './NavigationContext.jsx'
import { AdsProvider } from './AdsContext.jsx'
import { GalleryProvider } from './GalleryContext.jsx'
import { StudioProvider } from './StudioContext.jsx'
import { SettingsProvider } from './SettingsContext.jsx'

// Composes every feature's context so App.jsx doesn't have to nest them manually.
export function AppProviders({ children }) {
  return (
    <NavigationProvider>
      <AdsProvider>
        <GalleryProvider>
          <StudioProvider>
            <SettingsProvider>
              {children}
            </SettingsProvider>
          </StudioProvider>
        </GalleryProvider>
      </AdsProvider>
    </NavigationProvider>
  )
}
