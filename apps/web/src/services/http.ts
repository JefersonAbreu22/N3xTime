import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const http = axios.create({
  // The production web server proxies /api to the API process. Do not embed a
  // localhost URL in the browser bundle: there, localhost means each user's
  // own machine and is blocked by modern browsers as a loopback request.
  baseURL: import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_BASE_URL || '/api'),
});

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
