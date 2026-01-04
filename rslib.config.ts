import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      bundle: true,
      autoExternal: false,
      experiments: {
        advancedEsm: true
      }
    },
  ],
  output: {
    target: 'node',
    legalComments: 'none',
    minify: {
      js: true,
      jsOptions: {
        minimizerOptions: {
          minify: false,
          mangle: false,
          compress: {
            module: true,
            dead_code: true,
            toplevel: true,
          }
        }
      }
    }
  },
  source: {
    entry: {
      index: './src/cli.ts',
    },
  },
});
