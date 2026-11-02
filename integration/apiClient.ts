import axios from 'axios';

if (!process.env.API_URL) {
  throw new Error('API_URL is not defined in environment variables.');
}

export const apiClient = axios.create({
  baseURL: process.env.API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  validateStatus: () => true, // Tells Axios to accept ALL status codes without throwing
});
