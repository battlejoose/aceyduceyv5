'use client';

import { ACEY_PROGRAM_ID as programId, getAceyProgram } from '@project/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import toast from 'react-hot-toast'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../ui/ui-layout'
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { ADMIN_KEY, AMM_CONFIG, CLUBMOON_MINT, CLUBMOON_POOL_ID, DEV_AMM_CONFIG, DEV_CLUBMOON_MINT, DEV_CLUBMOON_POOL_ID, EMPTY_PUBLIC_KEY, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_DEVNET_CPMM_PROGRAM_ID, ZERO } from './acey-helpers';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';
import { useEffect } from 'react';

import { sha256 } from "js-sha256";
import bs58 from 'bs58';

export function useGetBalance({ address }: { address: PublicKey | null }) {
  const { connection } = useConnection();

  const balanceQuery = useQuery({
    queryKey: ['get-balance', { endpoint: connection.rpcEndpoint, address }],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }
      return connection.getBalance(address);
    },
    // Automatically refetch data every 10 minutes
    refetchInterval: 5000, // 10 minutes
    // Fetch on mount to ensure data is available when the component loads
    refetchOnMount: true,
    // Optionally fetch in the background when the user revisits the page/tab
    refetchOnWindowFocus: false,
  });

  return { balanceQuery };
}

export function useAceyProgram() {
  const { connection } = useConnection();
  const { cluster } = useCluster();
  const transactionToast = useTransactionToast();
  const provider = useAnchorProvider();
  const program = getAceyProgram(provider);

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  });



  return {
    program,
    programId,
    getProgramAccount,
  };
}


export function useInitGame() {
  const { program } = useAceyProgram();
  const transactionToast = useTransactionToast();
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWallet();
  const initGame = useMutation<
    string,
    Error
  >({
    mutationKey: ['initGame'],
    mutationFn: async ( ) => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

        const gameSeeds = [Buffer.from("game")];
        const gameAccountKey = PublicKey.findProgramAddressSync(gameSeeds, programId)[0];


        const solanaTreasurySeeds = [
          Buffer.from("solana"),
          gameAccountKey.toBuffer(),
        ];

        const solanaTreasury = await PublicKey.findProgramAddressSync(
          solanaTreasurySeeds,
          programId,
        )[0];



        
        const game = await program.methods
          .initGame()
          .accounts({
            signer:publicKey,
          })
          .instruction();

        

        const treasury = await program.methods
        .initTreasuries()
        .accounts({
          signer:publicKey,
          solanaMint: NATIVE_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

        
        const blockhashContext = await connection.getLatestBlockhashAndContext();

        
        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(game)
          .add(treasury);

        const simulationResult = await connection.simulateTransaction(transaction);
        console.log('Simulation Result:', simulationResult);

        const signature = await sendTransaction(transaction, connection, {
        });
        


        return signature;
        

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  return {
    initGame,
  };
}

export function useGameAccount() {
  const { program } = useAceyProgram();
  const transactionToast = useTransactionToast();
  const { connection } = useConnection();
  const { sendTransaction, publicKey } = useWallet();
  const {cluster} = useCluster();
  const queryClient = useQueryClient();

  const gameSeeds = [Buffer.from("game")];
  const gameAccountKey = PublicKey.findProgramAddressSync(gameSeeds, programId)[0];

  const userPlayerAccountQuery = useQuery({
    queryKey: ['userPlayerAccount', gameAccountKey.toBase58(), publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return null;
  
      const playerSeeds = [Buffer.from("player"), gameAccountKey.toBuffer(), publicKey.toBuffer()];
      const playerAccountKey = PublicKey.findProgramAddressSync(playerSeeds, programId)[0];
  
      try {
        return await program.account.playerAccount.fetch(playerAccountKey);
      } catch {
        return null; // Return null if the account does not exist
      }
    },
  });
  
  const { refetch } = userPlayerAccountQuery; // Extract refetch function
  
  useEffect(() => {
    if (!publicKey) return; // Prevent execution when wallet is not connected
  
    const playerSeeds = [Buffer.from("player"), gameAccountKey.toBuffer(), publicKey.toBuffer()];
    const playerAccountKey = PublicKey.findProgramAddressSync(playerSeeds, programId)[0];
  
    const subscriptionId = connection.onAccountChange(
      playerAccountKey,
      async (updatedAccountInfo) => {
        if (!updatedAccountInfo || updatedAccountInfo.data.length === 0) {
          // Account is closed, set query data to null
          queryClient.setQueryData(['userPlayerAccount', gameAccountKey.toBase58(), publicKey.toBase58() ], null);
        } else {
          try {
            const updatedData = await program.account.playerAccount.fetch(playerAccountKey);
            queryClient.setQueryData(['userPlayerAccount', gameAccountKey.toBase58(), publicKey.toBase58() ], updatedData);
  
            // **Refetch the query to ensure consistency**
            refetch();
          } catch (error) {
            console.error('Failed to fetch updated player account data:', error);
          }
        }
      }
    );
  
    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, publicKey, gameAccountKey, program, cluster, queryClient, refetch]);



  const gameAccountQuery = useQuery({
    queryKey: ['gameAccount', gameAccountKey.toBase58()],
    
    queryFn: async () => {
      return program.account.gameAccount.fetch(gameAccountKey);
    },
    refetchInterval: 3000, // Poll every 3 seconds
  });

  
  useEffect(() => {
    const fetchAndUpdate = async () => {
      try {
        const updatedData = await program.account.gameAccount.fetch(gameAccountKey);
        queryClient.setQueryData(['gameAccount', gameAccountKey.toBase58()], updatedData);
        queryClient.invalidateQueries({
          queryKey: ['playerAccountsQUERY', gameAccountKey.toBase58()]
        });
      } catch (error) {
        console.error('Failed to fetch updated game account data:', error);
      }
    };
  
    // Real-time subscription
    const subscriptionId = connection.onAccountChange(gameAccountKey, fetchAndUpdate);
  
    // Polling every 3 seconds
    const intervalId = setInterval(fetchAndUpdate, 3000);
  
    return () => {
      connection.removeAccountChangeListener(subscriptionId);
      clearInterval(intervalId);
    };
  }, [connection, gameAccountKey, program, queryClient]);
  
  
  const playersQuery = useQuery({
    queryKey: ['playerAccountsQUERY', gameAccountKey.toBase58()], 
    queryFn: async () => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }
  
      const gameAccount = await program.account.gameAccount.fetch(gameAccountKey);
  
      const playerAccountDiscriminator = Buffer.from(sha256.digest('account:PlayerAccount')).slice(0, 8);
  
      const filters = [
        { memcmp: { offset: 0, bytes: bs58.encode(playerAccountDiscriminator) } },
        { memcmp: { offset: 40, bytes: gameAccountKey.toBase58() } },
      ];
  
      let offset = 72; // Offset for `id`
      let length = 8;  // `id` is a `u64` (8 bytes)
  
      const accounts = await connection.getProgramAccounts(programId, {
        dataSlice: { offset, length },
        filters,
      });
  
      const accountsWithId = accounts.map(({ pubkey, account }) => {
        const id = new BN(account.data, 'le'); 
        return { pubkey, id };
      });
  
      const sortedAccounts = accountsWithId.sort((a, b) => a.id.cmp(b.id)); 
  
      return sortedAccounts;
    },
    enabled: !!gameAccountQuery.data, // Only fetch if gameAccount exists
  });



  const playerJoin = useMutation<
    string,
    Error,
    { userName: string }
  >({
    mutationKey: ['playerJoin', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async ({userName}) => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

     


        const join = await program.methods
          .playerJoin(userName)
          .accounts({
            signer:publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            admin: ADMIN_KEY,
          })
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(join);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });



  const playerAnte = useMutation<
    string,
    Error
  >({
    mutationKey: ['playerAnte', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

     


        const ante = await program.methods
          .playerAnte()
          .accounts({
            signer:publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            admin: ADMIN_KEY,
          })
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(ante);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  const playerBuyBack = useMutation<
    string,
    Error
  >({
    mutationKey: ['playerBuyBack', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

     


        const buyBack = await program.methods
          .playerBuyBack()
          .accounts({
            signer:publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            admin: ADMIN_KEY,
          })
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(buyBack);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  const finishBuyBack = useMutation<
    string,
    Error
  >({
    mutationKey: ['finishBuyBack', gameAccountKey.toBase58()],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

        const playerAccountDiscriminator = Buffer.from(sha256.digest('account:PlayerAccount')).slice(
          0,
          8
        );
  
        const filters = [
          {
            memcmp: { offset: 0, bytes: bs58.encode(playerAccountDiscriminator) },
          },
  
          {
            memcmp: { offset: 40, bytes: gameAccountKey.toBase58() },
          },
        ];

        let offset = 0;
        let length = 0;

        const accounts = await connection.getProgramAccounts(programId, {
          dataSlice: { offset, length },
          filters,
        });


        const remainingAccounts = accounts.map(account => ({
          pubkey: account.pubkey, // Use the public key from your array
          isWritable: true,      // Adjust this based on whether the account needs to be writable
          isSigner: false         // Adjust this based on whether the account is a signer
        }));
     

        const finish = await program.methods
          .finishBuyBack()
          .accounts({
            signer:publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            admin: ADMIN_KEY,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        

          

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(finish);

        const simulationResult = await connection.simulateTransaction(transaction);
        console.log('Simulation Result:', simulationResult);

        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error finishing buy back: ${error.message}`);
      console.error('Toast error:', error);
    },
  });


  const playerBet = useMutation<
    string,
    Error,
    {betAmount:BN}
  >({
    mutationKey: ['playerBet', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async ({betAmount}) => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

     


        const bet = await program.methods
          .playerBet(betAmount)
          .accounts({
            signer:publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            admin: ADMIN_KEY,
          })
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(bet);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  const nextTurn = useMutation<
    string,
    Error
  >({
    mutationKey: ['nextTurn', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

        const playerAccountDiscriminator = Buffer.from(sha256.digest('account:PlayerAccount')).slice(
          0,
          8
        );
  
        const filters = [
          {
            memcmp: { offset: 0, bytes: bs58.encode(playerAccountDiscriminator) },
          },
  
          {
            memcmp: { offset: 40, bytes: gameAccountKey.toBase58() },
          },
        ];

        let offset = 0;
        let length = 0;

        const accounts = await connection.getProgramAccounts(programId, {
          dataSlice: { offset, length },
          filters,
        });


        const remainingAccounts = accounts.map(account => ({
          pubkey: account.pubkey, // Use the public key from your array
          isWritable: false,      // Adjust this based on whether the account needs to be writable
          isSigner: false         // Adjust this based on whether the account is a signer
        }));



        const observationStateSeeds = [
          Buffer.from("observation"),
          CLUBMOON_POOL_ID.toBuffer(),
        ]

        const [observationState] = await PublicKey.findProgramAddressSync(
          observationStateSeeds,
          RAYDIUM_CPMM_PROGRAM_ID,
        );

        const inputVaultSeeds = [
          Buffer.from("pool_vault"),
          CLUBMOON_POOL_ID.toBuffer(),
          NATIVE_MINT.toBuffer(),
        ];

        const inputVault = await PublicKey.findProgramAddressSync(
          inputVaultSeeds,
          RAYDIUM_CPMM_PROGRAM_ID
        )[0];

        const outputVaultSeeds = [
          Buffer.from("pool_vault"),
          CLUBMOON_POOL_ID.toBuffer(),
          CLUBMOON_MINT.toBuffer(),
        ];

        const outputVault = await PublicKey.findProgramAddressSync(
          outputVaultSeeds,
          RAYDIUM_CPMM_PROGRAM_ID,
        )[0];



        const next = await program.methods
        .nextTurn()
        .accounts({
          signer: publicKey,
          clubmoonMint: CLUBMOON_MINT,
          solanaMint: NATIVE_MINT,
          ammConfig: AMM_CONFIG,
          poolState: CLUBMOON_POOL_ID,
          inputVault: inputVault,
          outputVault: outputVault,
          observationState: observationState,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .remainingAccounts(remainingAccounts)
        .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(next);

        const simulationResult = await connection.simulateTransaction(transaction);
        console.log('Simulation Result:', simulationResult);

        if (simulationResult.value.err) {
          console.error('Simulation Error:', simulationResult.value.err);
          throw new Error('Transaction simulation failed');
        }
        
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error going to next turn ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  const playerLeave = useMutation<
    string,
    Error
  >({
    mutationKey: ['playerLeave', gameAccountKey.toBase58(), publicKey?.toBase58() ],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */


        const playerAccountDiscriminator = Buffer.from(sha256.digest('account:PlayerAccount')).slice(
          0,
          8
        );
  
        const filters = [
          {
            memcmp: { offset: 0, bytes: bs58.encode(playerAccountDiscriminator) },
          },
  
          {
            memcmp: { offset: 40, bytes: gameAccountKey.toBase58() },
          },
        ];

        let offset = 0;
        let length = 0;

        const accounts = await connection.getProgramAccounts(programId, {
          dataSlice: { offset, length },
          filters,
        });

        const remainingAccounts = accounts.map(account => ({
          pubkey: account.pubkey, // Use the public key from your array
          isWritable: false,      // Adjust this based on whether the account needs to be writable
          isSigner: false         // Adjust this based on whether the account is a signer
        }));

        const playerSeeds = [
          Buffer.from("player"),
          gameAccountKey.toBuffer(),
          publicKey.toBuffer()
        ];
        const playerAccountKey = PublicKey.findProgramAddressSync(playerSeeds, programId)[0];


        const leave = await program.methods
          .playerLeave()
          .accounts({
            signer:publicKey,
            closingPlayerAccount:playerAccountKey
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(leave);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  const kickPlayer = useMutation<
    string,
    Error
  >({
    mutationKey: ['kickPlayer', gameAccountKey.toBase58(), publicKey?.toBase58()],
    mutationFn: async () => {
      try {
        if (publicKey === null) {
          throw new Error('Wallet not connected');
        }
        /*
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
          units: 16000,
        });

        const recentPriorityFees = await connection.getRecentPrioritizationFees({
        });
        const minFee = Math.min(...recentPriorityFees.map(fee => fee.prioritizationFee));

        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: minFee + 1,
        });
        */

     
        const playerAccountDiscriminator = Buffer.from(sha256.digest('account:PlayerAccount')).slice(
          0,
          8
        );
  
        const filters = [
          {
            memcmp: { offset: 0, bytes: bs58.encode(playerAccountDiscriminator) },
          },
  
          {
            memcmp: { offset: 40, bytes: gameAccountKey.toBase58() },
          },
        ];

        let offset = 0;
        let length = 0;

        const accounts = await connection.getProgramAccounts(programId, {
          dataSlice: { offset, length },
          filters,
        });

        const remainingAccounts = accounts.map(account => ({
          pubkey: account.pubkey, // Use the public key from your array
          isWritable: false,      // Adjust this based on whether the account needs to be writable
          isSigner: false         // Adjust this based on whether the account is a signer
        }));

        const gameAccountData = await program.account.gameAccount.fetch(gameAccountKey);
        const currentId  = gameAccountData.currentPlayerId;


        const currentIdBuffer = Buffer.alloc(8);
        currentId.toArrayLike(Buffer, "le", 8).copy(currentIdBuffer);

        filters.push({
          memcmp: { offset: 72, bytes: bs58.encode(currentIdBuffer) },
        });

        const currentPlayerAccounts = await connection.getProgramAccounts(programId, {
          dataSlice: { offset, length },
          filters,
        });

        const kick = await program.methods
          .kickPlayer()
          .accounts({
            signer:publicKey,
            closingPlayerAccount: currentPlayerAccounts[0].pubkey, 
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        const blockhashContext = await connection.getLatestBlockhashAndContext();

        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: blockhashContext.value.blockhash,
          lastValidBlockHeight: blockhashContext.value.lastValidBlockHeight,
        })
          //.add(modifyComputeUnits)
          //.add(addPriorityFee)
          .add(kick);
        const signature = await sendTransaction(transaction, connection, {
        });


        return signature;

      } catch (error) {
        console.error("Error during transaction processing:", error);
        throw error;
      }
    },

    onSuccess: (signature) => {
      transactionToast(signature);
    },
    onError: (error) => {
      toast.error(`Error initializing game ${error.message}`);
      console.error('Toast error:', error);
    },
  });

  return {
    gameAccountQuery,
    userPlayerAccountQuery, 
    playerJoin,
    playersQuery,
    playerAnte,
    playerBuyBack,
    playerBet,
    playerLeave,
    kickPlayer,
    nextTurn,
    finishBuyBack,
  };
}

export function usePlayerAccountQuery({
  accountKey
}: {
  accountKey:PublicKey
}) {
  const provider = useAnchorProvider();
  const program = getAceyProgram(provider);
  const { connection } = useConnection();
  const queryClient = useQueryClient();


  const playerAccountQuery = useQuery({
    queryKey: ['playerAccount', accountKey.toBase58()],
    queryFn: async () => {
      return program.account.playerAccount.fetch(accountKey);
    },
  });
  
  useEffect(() => {
    if (!connection || !accountKey) return;
  
    const handleAccountChange = async (updatedAccountInfo: any) => {
      try {
        const updatedData = await program.account.playerAccount.fetch(accountKey);
        queryClient.setQueryData(['playerAccount', accountKey.toBase58()], updatedData);
      } catch (error) {
        console.error('Failed to fetch updated player account data:', error);
      }
    };
  
    // Subscribe to account changes
    const subscriptionId = connection.onAccountChange(accountKey, handleAccountChange);
  
    // Cleanup function to remove the listener
    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, accountKey, program, queryClient]);



 

  return {
    playerAccountQuery
  };
}