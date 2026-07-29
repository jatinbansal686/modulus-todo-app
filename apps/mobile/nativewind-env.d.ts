/// <reference types="nativewind/types" />

/**
 * Teaches TypeScript that React Native components accept a `className` prop.
 *
 * NativeWind adds the prop at the Babel/runtime level, so without this reference
 * every `className` is a type error on a component that handles it perfectly well.
 * It must be a `.d.ts` picked up by the `include` glob — an import inside a source
 * file would be erased before it could augment anything.
 */
