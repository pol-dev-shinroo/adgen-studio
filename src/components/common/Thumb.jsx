export default function Thumb({ gradient, image, className, children }) {
  const cls = ['thumb', image ? 'has-image' : gradient, className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {image && <img src={image} alt="" className="thumb-img" />}
      {children}
    </div>
  )
}
