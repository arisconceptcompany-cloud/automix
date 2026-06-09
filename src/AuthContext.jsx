import { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { getCache, setCache } from './cache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const skipMe = useRef(false)

  useEffect(() => {
    if (skipMe.current) {
      skipMe.current = false
      setLoading(false)
      return
    }
    const cached = getCache('auth_me', 5000)
    if (cached) {
      setUser(cached)
      setLoading(false)
      return
    }
    axios.get('/api/auth/me')
      .then(r => {
        setUser(r.data.user)
        setCache('auth_me', r.data.user)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password, remember) => {
    const r = await axios.post('/api/auth/login', { email, password, remember })
    setUser(r.data.user)
    setCache('auth_me', r.data.user)
    skipMe.current = true
    return r.data
  }

  const register = async (full_name, email, password) => {
    const r = await axios.post('/api/auth/register', { full_name, email, password })
    return r.data
  }

  const logout = async () => {
    await axios.post('/api/auth/logout')
    setUser(null)
    setCache('auth_me', null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
