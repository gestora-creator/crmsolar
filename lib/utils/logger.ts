const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  error: (...args: unknown[]) => console.error(...args), // errors always log
}
