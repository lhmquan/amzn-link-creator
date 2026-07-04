/// <reference types="vite/client" />
import type { AmznApi } from '@shared/types'

declare global {
  interface Window {
    amzn: AmznApi
  }
}

export {}
