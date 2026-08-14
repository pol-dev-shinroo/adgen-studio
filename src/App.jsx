import { AppProviders } from './context/AppProviders.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { useNavigation } from './context/NavigationContext.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import Toast from './components/layout/Toast.jsx'
import LoginScreen from './components/auth/LoginScreen.jsx'
import Spinner from './components/common/Spinner.jsx'
import FeedScreen from './components/feed/FeedScreen.jsx'
import ProductsScreen from './components/products/ProductsScreen.jsx'
import ReferenceImagesScreen from './components/references/ReferenceImagesScreen.jsx'
import StudioScreen from './components/studio/StudioScreen.jsx'
import AIStudioScreen from './components/aiStudio/AIStudioScreen.jsx'
import GalleryScreen from './components/gallery/GalleryScreen.jsx'
import SettingsScreen from './components/settings/SettingsScreen.jsx'

function Screens() {
  const { screen } = useNavigation()
  return (
    <main>
      {screen === 'feed' && <FeedScreen />}
      {screen === 'products' && <ProductsScreen />}
      {screen === 'references' && <ReferenceImagesScreen />}
      {screen === 'studio' && <StudioScreen />}
      {screen === 'ai-studio' && <AIStudioScreen />}
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </main>
  )
}

// Part X: the real structural gate. No logged-in user -> only the login
// screen is reachable, nothing else — no sidebar, no nav, none of
// AppProviders' contexts even mount (several of them fetch real data the
// instant they mount, which shouldn't happen pre-login). authLoading covers
// the real GET /api/auth/me round-trip on first load, so a valid existing
// session never flashes the login screen before snapping back to the app.
function AppShell() {
  const { user, authLoading } = useAuth()

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="md" />
      </div>
    )
  }

  if (!user) return <LoginScreen />

  return (
    <AppProviders>
      <Sidebar />
      <Screens />
      <Toast />
    </AppProviders>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
