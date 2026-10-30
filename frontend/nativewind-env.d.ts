/// <reference types="nativewind/types" />

// Allow TypeScript to accept CSS file imports (used by NativeWind)
declare module '*.css' {
  const content: unknown;
  export default content;
}
