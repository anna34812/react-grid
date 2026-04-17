const STATUSES = ['active', 'pending', 'disabled']

export function generateRows(size = 1000) {
  return Array.from({ length: size }, (_, index) => {
    const id = index + 1
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      status: STATUSES[index % STATUSES.length],
      score: (id * 7) % 100,
    }
  })
}

export const mockRows = generateRows(1200)
