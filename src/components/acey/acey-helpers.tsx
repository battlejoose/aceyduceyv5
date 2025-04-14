import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

{/* constants*/}
export const ZERO = new BN(0);
export const BILLION = new BN(10).pow(new BN(9));
export const EMPTY_PUBLIC_KEY = new PublicKey("11111111111111111111111111111111");

export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export const CLUBMOON_MINT = new PublicKey('5gVSqhk41VA8U6U4Pvux6MSxFWqgptm3w58X9UTGpump');
export const DEV_CLUBMOON_MINT = new PublicKey('D2BYx2UoshNpAfgBEXEEyfUKxLSxkLMAb6zeZhZYgoos');

export const RAYDIUM_DEVNET_CPMM_PROGRAM_ID = new PublicKey('CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW')
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C')

export const AMM_CONFIG = new PublicKey('G95xxie3XbkCqtE39GgQ9Ggc7xBC8Uceve7HFDEFApkc')
export const DEV_AMM_CONFIG = new PublicKey('9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6')

export const CLUBMOON_POOL_ID = new PublicKey('5SpsdLEnA64NTHLRw2iXAQ2bq4rknA5M7sLmcDbymJxc')
export const DEV_CLUBMOON_POOL_ID = new PublicKey('5EE9nSoEP9QXyBHSL93BdWHDdCaj81mpEke8EGppKVa6')

export const ADMIN_KEY = new PublicKey('6gkkRU5t8WfXHWNuc6zQ7FoQxybcigLvzJKLz7Z1tGg')

export const SHRINK_RATE = 0.25;


export const toLamports = (amount: BN): BN => {
    return amount.mul(BILLION);
};

export const ToLamportsDecimals = (num: number): BN => {
    const numStr = num.toString(); // Convert the number to a string to handle decimals
    const [wholePart, decimalPart = ''] = numStr.split('.'); // Split into whole and decimal parts

    // Handle the decimal part by padding or trimming to 9 digits (1 billion precision)
    const decimalBN = new BN(
        (decimalPart + '0'.repeat(9)).slice(0, 9) // Ensure exactly 9 decimal places
    );

    const wholeBN = new BN(wholePart); // Convert the whole number part to BN
    const lamports = wholeBN.mul(BILLION).add(decimalBN); // Combine whole and fractional parts

    return lamports;
};


export const fromLamports = (amount: BN): BN => {
    return amount.div(BILLION);
};

export const fromLamportsDecimals = (amount: BN): number => {
    if (amount.gt(new BN(Number.MAX_SAFE_INTEGER))) {
        return fromLamports(amount).toNumber();
    }
    return amount.toNumber() / BILLION.toNumber();
};

export const shortenString = (input: string): string => {
    if (input.length <= 8) {
        return input; // Return as is if it's 8 or fewer characters
    }

    const firstFour = input.slice(0, 4);
    const lastFour = input.slice(-4);

    return `${firstFour}...${lastFour}`;
}

export type GameAccount = {
    entryPrice: BN;
    antePrice: BN;
    potAmount: BN;
    nextSkipTime: BN;
    currentBet: BN;
    playerNo: BN;
    currentPlayerId: BN;
    currentlyPlaying: BN;
    card1: number;
    card2: number;
    card3: number;
};

export const getCardSvgFilename = (number: number): string => {
    if (number < 1 || number > 52) return "b.svg"; // Default card back
  
    const suits = ["c", "d", "h", "s"]; // Clubs, Diamonds, Hearts, Spades
    const rank = ((number) % 13) + 1;
    const suit = suits[Math.floor((number - 1) / 13)]; // Determine suit
  
    return `${rank}${suit}.svg`; // Example: "1c.svg", "qc.svg", "10s.svg"
  };


export function simplifyBN(value: BN): string {
    const thresholds = [
        { suffix: 'b', divisor: new BN(10).pow(new BN(9)) }, // Billions
        { suffix: 'm', divisor: new BN(10).pow(new BN(6)) }, // Millions
        { suffix: 'k', divisor: new BN(10).pow(new BN(3)) }, // Thousands
    ];

    for (const { suffix, divisor } of thresholds) {
        if (value.gte(divisor)) {
            const simplified = value.mul(new BN(100)).div(divisor).toNumber() / 100;
            return `${simplified.toFixed(2)}${suffix}`;
        }
    }

    // If value is less than 1,000, return the original number
    return value.toString();
}