import { useNavigation } from '../../context/NavigationContext.jsx'

export default function Toast() {
  const { toastMsg, toastVisible } = useNavigation()
  return (
    <div id="toast" className={toastVisible ? 'show' : ''}>{toastMsg}</div>
  )
}
