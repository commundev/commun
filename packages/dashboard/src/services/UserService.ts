import { request, STORE_TOKENS_KEY, STORE_USER_KEY } from '../utils/apiUtils'

export const UserService = {
  async login (data: { username: string, password: string }) {
    const res = await request('POST', '/auth/password/login', data)
    localStorage.setItem(STORE_USER_KEY, JSON.stringify(res.user))
    localStorage.setItem(STORE_TOKENS_KEY, JSON.stringify(res.tokens))
    return res
  },
}
