// https://vitepress.dev/guide/custom-theme

import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Landing from './Landing.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: Landing,
} satisfies Theme
