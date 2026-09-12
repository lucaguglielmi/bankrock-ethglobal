export const BANK_ROCK_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '0x83B1A8a09f87258385698b9C433e143FDF2A9F52') as `0x${string}`;

export const BANK_ROCK_REGISTRY_ABI = 
[
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
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "rockId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "name": "TradeExecuted",
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
      },
      {
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "routerPayload",
        "type": "bytes"
      }
    ],
    "name": "executeTrade",
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

export const AQUA_ADDRESSES = {
  aquaContract: '0x111111125421cA6dc452d289314280a0f8842A65' as `0x${string}`,
  swapVmContract: '0x222222225421ca6dc452d289314280a0f8842a65' as `0x${string}`,
  testUSDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
  testWETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
};
