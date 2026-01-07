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
            evaluate: true,
            computed_props: true,
            drop_debugger: true,
            unused: true,
            side_effects: true,
            arrows: true,
            ecma: '2022',
            keep_fargs: false,
            keep_fnames: false,
            pure_getters: true,
            reduce_funcs: true,
            hoist_funs: true,
            hoist_props: true,
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
