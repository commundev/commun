import { routes } from '../routes'

export const STORE_USER_KEY = 'commun_dashboard_user'
export const STORE_TOKENS_KEY = 'commun_dashboard_tokens'

export async function request (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: any) {
  console.log(`[${method.toUpperCase()}] /api/v1${path}`)

  const headers: { [key: string]: string } = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const tokens = localStorage.getItem(STORE_TOKENS_KEY)
  if (tokens) {
    const accessToken = JSON.parse(tokens).accessToken
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
  }

  const res = await fetch('/api/v1' + path, {
    method,
    headers,
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = routes.Login.path
    }

    // Client Error
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json()
      throw new Error(data.error.message)
    }
    throw new Error('Something went wrong, please try again later')
  }

  return await res.json()
}