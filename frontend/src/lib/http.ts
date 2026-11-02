export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message ?? 'Unable to connect. Please try again.',
    );
  return data as T;
}
