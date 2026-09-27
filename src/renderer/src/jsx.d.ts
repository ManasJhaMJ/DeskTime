// React 19 removed the global JSX namespace; restore it for component return types.
import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
  }
}
