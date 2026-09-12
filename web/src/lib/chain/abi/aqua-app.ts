// Generated from contracts/abi/XYCSwap.json, contracts/abi/XYCSwapTaker.json by scripts/sync-web-abi.mjs.
// Do not edit by hand. Regenerate with "npm run compile" in contracts/, or by running
// "node scripts/sync-web-abi.mjs" from the repository root.
//
// The Aqua app path: `XYCSwap` and the taker periphery that reaches it.
//
// XYCSwap is the reference constant-product AquaApp, vendored unmodified from
// github.com/1inch/aqua at commit 9c5c42e5 (contracts/aqua/UPSTREAM.md) and deployed by us:
// 1inch publishes no XYCSwap deployment on any network. It is the spec 04 fallback the D-023
// amendment allows, and it carries no strategy logic of ours.
//
// XYCSwapTaker exists because XYCSwap settles a swap by calling `xycSwapCallback` back into
// its caller: an EOA or a plain Safe cannot trade against it directly (contracts/aqua/NOTES.md
// §5). A visitor's transaction is `approve(taker, amountIn)` then `taker.swapExactIn(...)`.
//
// No address appears here. Both come from the environment — NEXT_PUBLIC_AQUA_APP_ADDRESS and
// NEXT_PUBLIC_AQUA_TAKER_ADDRESS — through `lib/aqua/config.ts` (D-015).
export const XYC_SWAP_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract IAqua",
        "name": "aqua_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountInMax",
        "type": "uint256"
      }
    ],
    "name": "ExcessiveInputAmount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountOutMin",
        "type": "uint256"
      }
    ],
    "name": "InsufficientOutputAmount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "maker",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "strategyHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "app",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "actualThis",
        "type": "address"
      }
    ],
    "name": "InvalidAquaStrategy",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MissingNonReentrantModifier",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "newBalance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "expectedBalance",
        "type": "uint256"
      }
    ],
    "name": "MissingTakerAquaPush",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnexpectedLock",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AQUA",
    "outputs": [
      {
        "internalType": "contract IAqua",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "feeBps",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "salt",
            "type": "bytes32"
          }
        ],
        "internalType": "struct XYCSwap.Strategy",
        "name": "strategy",
        "type": "tuple"
      },
      {
        "internalType": "bool",
        "name": "zeroForOne",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "name": "quoteExactIn",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "feeBps",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "salt",
            "type": "bytes32"
          }
        ],
        "internalType": "struct XYCSwap.Strategy",
        "name": "strategy",
        "type": "tuple"
      },
      {
        "internalType": "bool",
        "name": "zeroForOne",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "name": "quoteExactOut",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "feeBps",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "salt",
            "type": "bytes32"
          }
        ],
        "internalType": "struct XYCSwap.Strategy",
        "name": "strategy",
        "type": "tuple"
      },
      {
        "internalType": "bool",
        "name": "zeroForOne",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountOutMin",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "takerData",
        "type": "bytes"
      }
    ],
    "name": "swapExactIn",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "feeBps",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "salt",
            "type": "bytes32"
          }
        ],
        "internalType": "struct XYCSwap.Strategy",
        "name": "strategy",
        "type": "tuple"
      },
      {
        "internalType": "bool",
        "name": "zeroForOne",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountInMax",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "takerData",
        "type": "bytes"
      }
    ],
    "name": "swapExactOut",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const XYC_SWAP_TAKER_ABI = [
  {
    "inputs": [
      {
        "internalType": "contract IAqua",
        "name": "aqua_",
        "type": "address"
      },
      {
        "internalType": "contract XYCSwap",
        "name": "app_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "CallbackNeverHappened",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SwapAlreadyInProgress",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nowTimestamp",
        "type": "uint256"
      }
    ],
    "name": "SwapExpired",
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
        "name": "expected",
        "type": "address"
      }
    ],
    "name": "UnexpectedCallback",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "provided",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "expected",
        "type": "uint256"
      }
    ],
    "name": "UnexpectedCallbackAmount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "provided",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "expected",
        "type": "bytes32"
      }
    ],
    "name": "UnexpectedCallbackStrategy",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "provided",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "expected",
        "type": "address"
      }
    ],
    "name": "UnexpectedCallbackToken",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "taker",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": true,
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
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "name": "Swapped",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "APP",
    "outputs": [
      {
        "internalType": "contract XYCSwap",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "AQUA",
    "outputs": [
      {
        "internalType": "contract IAqua",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "maker",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token0",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token1",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "feeBps",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "salt",
            "type": "bytes32"
          }
        ],
        "internalType": "struct XYCSwap.Strategy",
        "name": "strategy",
        "type": "tuple"
      },
      {
        "internalType": "bool",
        "name": "zeroForOne",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountOutMin",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "swapExactIn",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "version",
    "outputs": [
      {
        "internalType": "string",
        "name": "semver",
        "type": "string"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "maker",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "app",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "strategyHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "name": "xycSwapCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
