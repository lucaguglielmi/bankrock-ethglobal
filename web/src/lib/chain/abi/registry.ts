/**
 * BankRockRegistry ABI.
 *
 * Derived from contracts/BankRockRegistry.sol, with the arbitrary-call primitive removed per
 * D-020: `executeTrade`, `setRouterWhitelist`, `whitelistedRouters`, the
 * `RouterWhitelisted` and `TradeExecuted` events are gone. The registry is an identity
 * and lifecycle registry only — it never holds funds, never receives approvals and never
 * performs a call with caller-supplied calldata. Swaps execute from the Rock Account against
 * Aqua (spec 03).
 *
 * The registry is not deployed yet (C-1). Its address comes from NEXT_PUBLIC_REGISTRY_ADDRESS
 * via lib/chain; there is no literal here.
 */

export const BANK_ROCK_REGISTRY_ABI = [
  {
    "inputs": [],
    "name": "InvalidNFCSequence",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidNewOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      }
    ],
    "name": "RockAlreadyAwakened",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      }
    ],
    "name": "RockNotAwakened",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "expectedOwner",
        "type": "address"
      }
    ],
    "name": "UnauthorizedTapper",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "smartAccount",
        "type": "address"
      }
    ],
    "name": "RockAwakened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "RockOwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "poker",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "message",
        "type": "string"
      }
    ],
    "name": "RockPoked",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "smartAccount",
        "type": "address"
      }
    ],
    "name": "awakenRock",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "nfcPubKey",
        "type": "bytes32"
      }
    ],
    "name": "bindNFC",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      }
    ],
    "name": "getRock",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "smartAccount",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "currentOwner",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "awakenedAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isAwake",
            "type": "bool"
          }
        ],
        "internalType": "struct BankRockRegistry.Rock",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      }
    ],
    "name": "getRockStatusJSON",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      }
    ],
    "name": "isAwakened",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poke",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "rockToNfcPubKey",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "rocks",
    "outputs": [
      {
        "internalType": "address",
        "name": "smartAccount",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "currentOwner",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "awakenedAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isAwake",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
