// Simple logger utility
const logger = {
    info: (message: string, data?: any) => {
      console.log(`[INFO] ${message}`, data ? data : "")
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`, error ? error : "")
      if (error?.stack) {
        console.error(error.stack)
      }
    },
    warn: (message: string, data?: any) => {
      console.warn(`[WARN] ${message}`, data ? data : "")
    },
    debug: (message: string, data?: any) => {
      console.log(`[DEBUG] ${message}`, data ? data : "")
    },
  }
  
  export default logger
  
  