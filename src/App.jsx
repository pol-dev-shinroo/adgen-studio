import { AppProviders } from './context/AppProviders.jsx'
import { useNavigation } from './context/NavigationContext.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import Toast from './components/layout/Toast.jsx'
import FeedScreen from './components/feed/FeedScreen.jsx'
import ProductsScreen from './components/products/ProductsScreen.jsx'
import ReferenceImagesScreen from './components/references/ReferenceImagesScreen.jsx'
import StudioScreen from './components/studio/StudioScreen.jsx'
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
      {screen === 'gallery' && <GalleryScreen />}
      {screen === 'settings' && <SettingsScreen />}
    </main>
  )
}

export default function App() {
  return (
    <AppProviders>
      <Sidebar />
      <Screens />
      <Toast />
    </AppProviders>
  )
}
