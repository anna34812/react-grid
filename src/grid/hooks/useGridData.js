import { useEffect, useMemo, useRef, useState } from 'react'
import { getRows } from '../api/gridApi'

export function useGridData(queryState, setTotalCount) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)
  const requestQuery = useMemo(
    () => ({
      page: queryState.page,
      pageSize: queryState.pageSize,
      sortField: queryState.sortField,
      sortDirection: queryState.sortDirection,
      filters: queryState.filters ?? {},
    }),
    [
      queryState.page,
      queryState.pageSize,
      queryState.sortField,
      queryState.sortDirection,
      queryState.filters,
    ],
  )

  useEffect(() => {
    let active = true
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    async function loadRows() {
      setLoading(true)
      setError('')

      try {
        const response = await getRows(requestQuery)
        if (!active || requestId !== requestIdRef.current) {
          return
        }

        setRows(response.rows)
        setTotalCount(response.totalCount)
      } catch (requestError) {
        if (!active || requestId !== requestIdRef.current) {
          return
        }

        setRows([])
        setError(requestError.message || 'Failed to load rows')
      } finally {
        if (active && requestId === requestIdRef.current) {
          setLoading(false)
        }
      }
    }

    loadRows()

    return () => {
      active = false
    }
  }, [
    requestQuery,
    setTotalCount,
  ])

  return { rows, loading, error, setRows }
}
