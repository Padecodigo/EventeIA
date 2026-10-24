import OpenAI from 'openai';
import 'server-only';

// A NVIDIA Build usa uma API compatível com OpenAI
export const nvidiaDeepSeekClient = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// Modelo padrão recomendado na NVIDIA NIM para DeepSeek
export const DEEPSEEK_MODEL = process.env.NVIDIA_MODEL_NAME || 'deepseek-ai/deepseek-r1';
