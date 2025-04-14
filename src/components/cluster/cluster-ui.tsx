'use client'

import { useQuery } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useCluster } from './cluster-data-access'

export function ExplorerLink({ path, label, className }: { path: string; label: string; className?: string }) {
    const { getExplorerUrl } = useCluster()
    return (
        <a
            href={getExplorerUrl(path)}
            target="_blank"
            rel="noopener noreferrer"
            className={className ? className : `link font-mono`}
        >
            {label}
        </a>
    )
}

export function ClusterChecker({ children }: { children: ReactNode }) {
    const { cluster } = useCluster()
    const query = useQuery({
        queryKey: ['version', { cluster }],
        queryFn: async () => {
            const response = await fetch(cluster.endpoint)
            if (!response.ok) {
                throw new Error(`Failed to connect to cluster: ${cluster.name}`)
            }
            return response.json()
        },
        retry: 1,
    })

    if (query.isLoading) {
        return <div>Loading...</div>
    }
    if (query.isError || !query.data) {
        return (
            <div className="alert alert-warning text-warning-content/80 rounded-none flex justify-center">
                <span>Error connecting to cluster: <strong>{cluster.name}</strong></span>
                <button className="btn btn-xs btn-neutral" onClick={() => query.refetch()}>
                    Retry
                </button>
            </div>
        )
    }
    return <>{children}</>
}

export function ClusterUiTable() {
    const { cluster } = useCluster()

    return (
        <div className="overflow-x-auto">
            <table className="table border-4 border-separate border-base-300">
                <thead>
                    <tr>
                        <th>Name / Network / Endpoint</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="bg-base-200">
                        <td className="space-y-2">
                            <div className="whitespace-nowrap space-x-2">
                                <span className="text-xl">{cluster.name}</span>
                            </div>
                            <span className="text-xs">Network: {cluster.network}</span>
                            <div className="whitespace-nowrap text-gray-500 text-xs">{cluster.endpoint}</div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}