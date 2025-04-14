'use client'

import Link from 'next/link'
import {usePathname} from 'next/navigation'
import * as React from 'react'
import {ReactNode, Suspense, useEffect, useRef} from 'react'
import toast, {Toaster} from 'react-hot-toast'

import {ExplorerLink} from '../cluster/cluster-ui'
import {WalletButton} from '../solana/solana-provider'

import { FaGlobe, FaTelegramPlane } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { InitGameButton, ShowGame } from '../acey/acey-ui'
import { useGetBalance } from '../acey/acey-data-access'
import { useWallet } from '@solana/wallet-adapter-react'
import { fromLamportsDecimals, ZERO } from '../acey/acey-helpers'
import BN from 'bn.js'


export function UiLayout({ children, links }: { children: ReactNode; links: { label: string; path: string }[] }) {
  const pathname = usePathname()
  const {publicKey} = useWallet();
  const {balanceQuery} = useGetBalance({address:publicKey})


  const [balance, setBalance] = React.useState(ZERO);

  useEffect(() => {
    if (balanceQuery.data) {
      setBalance(new BN(balanceQuery.data));
    }
  }, [balanceQuery.data]);
  



  

  return (
    <div className="h-full flex font-mono">
      {/* Floating Buttons */}
      <div className="fixed top-4 right-4 flex flex-col space-y-2 z-50">
        <WalletButton />
        <div className="font-mono">
          Balance: <span className="font-bold">{fromLamportsDecimals(balance)} SOL</span>
        </div>
      </div>


      {/* Main Content */}
      <div className="flex flex-col flex-grow overflow-auto">

        {/* Hero Section */}
        <div className="hero mt-[64px]">

          <div className="hero-content text-center">
            <div className="max-w-2xl">
              <h1 className="text-5xl font-bold">Club Moon</h1>
              <div className="flex justify-center items-center mt-2 space-x-2">
                            {/* Telegram Icon */}
                <a
                    href="https://t.me/solanasclubmoon"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-5 h-5 text-gray-500 dark:text-white hover:text-primary"
                >
                    <FaTelegramPlane />
                </a>

                {/* Twitter (X) Icon */}

                <a
                    href="https://x.com/clubmoonsol"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-5 h-5 text-gray-500 dark:text-white hover:text-primary"
                >
                    <FaXTwitter />
                </a>

                <a
                    href="https://clubmoon.wtf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-5 h-5 text-gray-500 dark:text-white hover:text-primary"
                >
                    <FaGlobe />
                </a>
              </div>

                {/*<InitGameButton />*/}

              
            </div>
          </div>
          
        </div>

        
        <ShowGame/>
        

        <div className="flex-grow mx-4 lg:mx-auto mt-4">
          <Suspense
            fallback={
              <div className="text-center my-32">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            }
          >
            {children}
          </Suspense>
          <Toaster position="bottom-right" />
        </div>

        {/* Footer */}
        <footer className="footer footer-center border-t-2 border-black dark:border-white p-4 text-gray-500 dark:text-white mt-10">
          <p className="inline-flex items-center space-x-2">
            <a>&copy; {new Date().getFullYear()} clubmoon.wtf</a>|PrivacyPolicy|TermsOfService
          </p>
        </footer>
      </div>
      

    </div>
  )
}

export function AppModal({
  children,
  title,
  hide,
  show,
  submit,
  submitDisabled,
  submitLabel,
}: {
  children: ReactNode
  title: string
  hide: () => void
  show: boolean
  submit?: () => void
  submitDisabled?: boolean
  submitLabel?: string
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    if (!dialogRef.current) return
    if (show) {
      dialogRef.current.showModal()
    } else {
      dialogRef.current.close()
    }
  }, [show, dialogRef])

  return (
    <dialog className="modal" ref={dialogRef}>
      <div className="modal-box space-y-5">
        <h3 className="font-bold text-lg">{title}</h3>
        {children}
        <div className="modal-action">
          <div className="join space-x-2">
            {submit ? (
              <button className="btn btn-xs lg:btn-md btn-primary" onClick={submit} disabled={submitDisabled}>
                {submitLabel || 'Save'}
              </button>
            ) : null}
            <button onClick={hide} className="btn">
              Close
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

export function AppHero({
  children,
  title,
  subtitle,
}: {
  children?: ReactNode
  title: ReactNode
  subtitle: ReactNode
}) {
  return (
    <div className="hero py-[64px]">
      <div className="hero-content text-center">
        <div className="max-w-2xl">
          {typeof title === 'string' ? <h1 className="text-5xl font-bold">{title}</h1> : title}
          {typeof subtitle === 'string' ? <p className="py-6">{subtitle}</p> : subtitle}
          {children}
        </div>
      </div>
    </div>
  )
}

export function ellipsify(str = '', len = 4) {
  if (str.length > 30) {
    return str.substring(0, len) + '..' + str.substring(str.length - len, str.length)
  }
  return str
}

export function useTransactionToast() {
  return (signature: string) => {
    toast.success(
      <div className={'text-center'}>
        <div className="text-lg">Transaction sent</div>
        <ExplorerLink path={`tx/${signature}`} label={'View Transaction'} className="btn btn-xs btn-primary" />
      </div>,
    )
  }
}
