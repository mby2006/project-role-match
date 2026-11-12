export async function searchNotes(query, { signal } = {}) {
  const response = await fetch(`/api/notes?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) {
    throw new Error(`搜索接口返回 ${response.status}`);
  }
  return response.json();
}
