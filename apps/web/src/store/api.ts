// apps/web/src/store/api.ts

import axios, { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './useAuthStore';

// Determine base URL based on environment
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Interceptor to add session ID to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { sessionId } = useAuthStore.getState();
  if (sessionId) {
    if (!config.headers) config.headers = {} as any;
    config.headers['x-session-id'] = sessionId;
  }
  return config;
});
