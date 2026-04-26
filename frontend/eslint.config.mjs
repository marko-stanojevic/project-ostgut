import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      // React 19 / Next 16 enables React Compiler advisory rules via
      // eslint-plugin-react-hooks. They are valuable migration signals, but
      // treating them as errors would require broad data-fetching and player
      // lifecycle refactors during a dependency bump. Keep the existing lint
      // gate focused on correctness rules until we opt into compiler cleanup.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]

export default config
