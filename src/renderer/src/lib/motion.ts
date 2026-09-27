import type { Variants } from 'framer-motion'

/** Offscreen capture mode: render final states immediately. */
export const STATIC =
  document.documentElement.classList.contains('static') || document.documentElement.classList.contains('motion-off')

const EASE = [0.2, 0.8, 0.2, 1] as const

/** A page: fades in and staggers its children. */
export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, when: 'beforeChildren', staggerChildren: 0.045 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14 } }
}

/** Cards and tiles: rise a few pixels while fading in. */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: EASE } }
}
