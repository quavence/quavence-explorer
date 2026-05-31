export async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Fetch to ${url} returned error status ${res.status}`);
      return fallback;
    }
    return await res.json();
  } catch (error) {
    console.warn(`Fetch to ${url} failed:`, error);
    return fallback;
  }
}
