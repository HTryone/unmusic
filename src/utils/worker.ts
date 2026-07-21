/// <reference lib="webworker" />
import { Decrypt } from '@/decrypt';

interface WorkerRequest {
  id: string;
  file: any;
  config: Record<string, any>;
}

interface WorkerResponse {
  id: string;
  result?: any;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file, config } = e.data;
  try {
    const result = await Decrypt(file, config);
    const response: WorkerResponse = { id, result };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: WorkerResponse = { id, error: String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};
