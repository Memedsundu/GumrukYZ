// Webpack inlines .woff/.woff2 files as base64 data URIs (asset/inline rule).
declare module '*.woff' {
  const src: string
  export default src
}
declare module '*.woff2' {
  const src: string
  export default src
}
