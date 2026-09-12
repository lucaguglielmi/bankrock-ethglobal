// SPDX-License-Identifier: LicenseRef-Degensoft-Aqua-Source-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/aqua/blob/main/LICENSES/Aqua-Source-1.1.txt
/// @custom:attribution Aqua — © Degensoft Ltd 2025
/// @custom:copyright © 2026 Bank Rock — this file is Bank Rock's, released under the Aqua Source
///                   license because it composes with the Licensed Work (Aqua-Source-1.1 §1.7,
///                   §3.1). It contains no strategy, pricing or accounting logic of its own.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAqua } from "./src/interfaces/IAqua.sol";
import { XYCSwap } from "./examples/apps/XYCSwap.sol";
import { IXYCSwapCallback } from "./examples/apps/interfaces/IXYCSwapCallback.sol";

/**
 * @title XYCSwapTaker — the taker-side entry point for XYCSwap strategies
 *
 * @notice XYCSwap settles a swap by *calling back into `msg.sender`*: it pulls the output token
 *         out of the maker's wallet first, then invokes `IXYCSwapCallback.xycSwapCallback` on the
 *         caller, and only then checks — via `AquaApp._safeCheckAquaPush` — that the caller has
 *         pushed the input token into the maker's Aqua balance. A taker that is an EOA or a plain
 *         Safe therefore **cannot** call `XYCSwap.swapExactIn` directly: the high-level callback
 *         to an address with no code reverts on the `extcodesize` check, and a contract that does
 *         not implement the callback fails `MissingTakerAquaPush`.
 *
 *         This contract is that missing periphery, and nothing more. It is the taker equivalent
 *         of Uniswap's `SwapRouter`:
 *
 *           1. it pulls `amountIn` of the input token from the taker (who approved *this*
 *              contract, not Aqua and not the app);
 *           2. it calls `XYCSwap.swapExactIn`, naming the taker as the recipient, so the output
 *              token goes straight from the maker's wallet to the taker;
 *           3. in the callback it approves Aqua and calls `Aqua.push`, which moves the input
 *              token from here into the maker's wallet and credits the strategy's virtual
 *              balance.
 *
 *         Pricing, fees and balances are entirely XYCSwap's and Aqua's. This contract holds no
 *         funds between transactions and has no owner, no admin and no upgrade path.
 *
 * @dev Reentrancy/authorisation: `xycSwapCallback` is externally callable by anyone, so it is
 *      gated on `_activeApp`, a transient (EIP-1153) slot set only for the duration of the swap
 *      this contract itself initiated. Outside that window the callback always reverts.
 */
contract XYCSwapTaker is IXYCSwapCallback {
    using SafeERC20 for IERC20;

    /// @notice Thrown when `xycSwapCallback` is invoked outside a swap this contract started,
    ///         or by an address other than the app that swap was sent to.
    error UnexpectedCallback(address caller, address expected);

    /// @notice The Aqua protocol contract the strategies live in. Immutable, set at deployment.
    IAqua public immutable AQUA;

    /// @dev The app whose callback is expected right now. Zero outside a swap.
    address private transient _activeApp;

    /// @param aqua_ The canonical Aqua deployment (Ethereum Sepolia: 0x1111113ccf…6a90a).
    constructor(IAqua aqua_) {
        AQUA = aqua_;
    }

    /**
     * @notice Swaps an exact input amount against a shipped XYCSwap strategy.
     * @dev The caller must have approved this contract for `amountIn` of the input token.
     * @param app The XYCSwap app the strategy was shipped to.
     * @param strategy The strategy, exactly as it was shipped — `keccak256(abi.encode(strategy))`
     *        must equal the `strategyHash` Aqua holds, or `safeBalances` reverts.
     * @param zeroForOne True to sell `strategy.token0` for `strategy.token1`, false for the other
     *        direction.
     * @param amountIn The exact amount of the input token to sell.
     * @param amountOutMin The minimum acceptable output; the swap reverts below it.
     * @param to The recipient of the output token. Zero means the caller.
     * @return amountOut The output amount, as computed and executed by XYCSwap.
     */
    function swapExactIn(
        XYCSwap app,
        XYCSwap.Strategy calldata strategy,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin,
        address to
    ) external returns (uint256 amountOut) {
        IERC20 tokenIn = IERC20(zeroForOne ? strategy.token0 : strategy.token1);
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);

        _activeApp = address(app);
        amountOut = app.swapExactIn(
            strategy,
            zeroForOne,
            amountIn,
            amountOutMin,
            to == address(0) ? msg.sender : to,
            ""
        );
        _activeApp = address(0);

        // Nothing is meant to stay here. Return any residue to the caller so a failed assumption
        // (or a stray transfer) can never be stranded or swept by the next taker.
        uint256 residue = tokenIn.balanceOf(address(this));
        if (residue > 0) {
            tokenIn.safeTransfer(msg.sender, residue);
        }
    }

    /// @inheritdoc IXYCSwapCallback
    function xycSwapCallback(
        address tokenIn,
        address /* tokenOut */,
        uint256 amountIn,
        uint256 /* amountOut */,
        address maker,
        address app,
        bytes32 strategyHash,
        bytes calldata /* takerData */
    ) external override {
        address expected = _activeApp;
        require(msg.sender == expected && app == expected, UnexpectedCallback(msg.sender, expected));

        IERC20(tokenIn).forceApprove(address(AQUA), amountIn);
        AQUA.push(maker, app, strategyHash, tokenIn, amountIn);
    }
}
