export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export const hasApiBaseUrl = () => Boolean(API_BASE_URL);

export class ApiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
  }
}

const buildUrl = (path) => {
  if (!hasApiBaseUrl()) {
    throw new ApiError('API base URL is not configured.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export async function apiFetch(path, options = {}) {
  const { headers, ...restOptions } = options;

  let response;

  try {
    response = await fetch(buildUrl(path), {
      ...restOptions,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  } catch (error) {
    throw new ApiError('API request failed.', { cause: error });
  }

  if (!response.ok) {
    throw new ApiError(`API request failed with status ${response.status}.`, {
      status: response.status,
    });
  }

  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ApiError('API response is not valid JSON.', {
      status: response.status,
      cause: error,
    });
  }
}
