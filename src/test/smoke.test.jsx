import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// CC-6: confirms the Vitest + jsdom + Testing Library pipeline itself works
// (JSX transform, DOM rendering, jest-dom matchers) before any real test
// content is written against it.
describe('frontend test infra smoke test', () => {
  it('renders a component and finds it in the DOM', () => {
    render(<div>hello test infra</div>)
    expect(screen.getByText('hello test infra')).toBeInTheDocument()
  })
})
