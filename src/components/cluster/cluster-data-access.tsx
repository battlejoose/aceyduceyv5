'use client'

import { Connection } from '@solana/web3.js'
import { atom, useAtomValue } from 'jotai'
import { createContext, ReactNode, useContext } from 'react'

export interface Cluster {
    name: string
    endpoint: string
    network: ClusterNetwork
}


export enum ClusterNetwork {
    Mainnet = 'mainnet-beta',
}

export const defaultCluster: Cluster = {
    name: 'mainnet',
    endpoint: "https://boldest-thrilling-market.solana-mainnet.quiknode.pro/b4c82bf3b9abce9c0f2a06b213b35da920beaf58",
    network: ClusterNetwork.Mainnet,
}

/*
export enum ClusterNetwork {
    Devnet = 'devnet',
}

export const defaultCluster: Cluster = {
    name: 'devnet',
    endpoint: "https://api.devnet.solana.com",
    network: ClusterNetwork.Devnet,
}
    */

// Atom for managing the active cluster (fixed to Mainnet)
const clusterAtom = atom<Cluster>(defaultCluster)

// Context for providing cluster information
export interface ClusterProviderContext {
    cluster: Cluster
    getExplorerUrl(path: string): string
}

const Context = createContext<ClusterProviderContext>({} as ClusterProviderContext)

export function ClusterProvider({ children }: { children: ReactNode }) {
    const cluster = useAtomValue(clusterAtom)

    const value: ClusterProviderContext = {
        cluster,
        getExplorerUrl: (path: string) => `https://explorer.solana.com/${path}`,
    }

    return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCluster() {
    return useContext(Context)
}