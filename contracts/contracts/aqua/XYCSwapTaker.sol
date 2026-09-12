// SPDX-License-Identifier: LicenseRef-Degensoft-Aqua-Source-1.1
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAqua } from "./src/interfaces/IAqua.sol";
import { XYCSwap } from "./examples/apps/XYCSwap.sol";
import { IXYCSwapCallback } from "./examples/apps/interfaces/IXYCSwapCallback.sol";

/**
 * @title XYCSwapTaker — the taker-side entry point for XYCSwap strategies
 * @author Bank Rock
 *
 * @notice This is the contract a visitor trades through. It exists because of one detail of the
 *         app's design: XYCSwap settles a swap by *calling back into whoever called it*. It sends
 *         the output token from the maker's wallet first, then invokes `xycSwapCallback` on the
 *         caller, and only then checks that the caller has pushed the input token into the maker's
 *         Aqua balance. A wallet cannot answer that callback — a plain address has no code — so a
 *         person cannot trade against XYCSwap directly. This contract answers it for them.
 * @notice It is the taker equivalent of a swap router, and nothing more. Pricing, fees and
 *         balances are entirely XYCSwap's and Aqua's; this contract has no pricing logic, no
 *         owner, no administrator, no upgrade path and no privileged address of any kind.
 * @notice To use it: approve this contract for the token you are selling, then call `swapExactIn`.
 *         The output goes straight from the maker's wallet to the recipient you name.
 *
 * @dev **Tokens sent to this contract are lost.** It holds nothing between transactions by
 *      construction: a swap pulls exactly `amountIn` from the caller and the app consumes exactly
 *      that, so the balance is zero at the end of every successful swap, and there is no rescue
 *      function. That is deliberate. A rescue function is an admin key, and this periphery exists
 *      precisely so that no admin key sits on the trade path — a key that can move tokens out of
 *      the contract everyone approves is a far larger risk than the occasional mis-sent transfer.
 *      Do not send tokens to this address; approve it instead.
 *
 * @dev Unsupported token classes. Fee-on-transfer and rebasing tokens do not work here: the app is
 *      told to expect `amountIn` and the push would arrive short, so the swap reverts rather than
 *      settling wrongly. Tokens with transfer hooks (ERC-777 and similar) can re-enter during the
 *      pull; the callback ticket below makes that harmless, but they remain unsupported. The
 *      interface offers USDC and WETH, neither of which is in any of those classes.
 *
 * @dev Authorisation of the callback. `xycSwapCallback` is externally callable by anyone, so it is
 *      gated on a transient (EIP-1153) *ticket* written when this contract starts a swap: the app,
 *      the token, the amount, the maker and the strategy hash of that swap. The callback must come
 *      from `APP`, must match every recorded field, and clears the ticket before doing anything —
 *      so exactly one callback is possible per swap, for exactly the values that swap named.
 *      Outside a swap there is no ticket and the callback always reverts.
 *
 * @custom:license-url https://github.com/1inch/aqua/blob/main/LICENSES/Aqua-Source-1.1.txt
 * @custom:attribution Aqua — © Degensoft Ltd 2025
 * @custom:copyright © 2026 Bank Rock — this file is Bank Rock's, released under the Aqua Source
 *                   license because it composes with the Licensed Work (Aqua-Source-1.1 §1.7,
 *                   §3.1). It contains no strategy, pricing or accounting logic of its own.
 * @custom:security-contact security@bank-rock.com
 */
contract XYCSwapTaker is IXYCSwapCallback {
    using SafeERC20 for IERC20;

    /* --------------------------------------------------------------------- */
    /*  Immutables                                                            */
    /* --------------------------------------------------------------------- */

    /// @notice The Aqua protocol contract the strategies live in. Fixed at deployment.
    IAqua public immutable AQUA;

    /**
     * @notice The one XYCSwap app this periphery will trade through. Fixed at deployment.
     * @dev It is an immutable rather than a parameter on purpose. When the caller chose the app,
     *      this contract would call an arbitrary address and then believe the token, amount, maker
     *      and strategy hash that address handed back — which is authority over anything the
     *      periphery held at that instant. Fixing it removes the attack and removes a field from
     *      the Etherscan form. A second app means a second deployment of this contract.
     */
    XYCSwap public immutable APP;

    /* --------------------------------------------------------------------- */
    /*  Transient state — the callback ticket                                 */
    /* --------------------------------------------------------------------- */

    /// @dev The token this swap pulled. Zero outside a swap, and zeroed by the callback.
    address private transient _ticketToken;
    /// @dev The amount this swap pulled.
    uint256 private transient _ticketAmount;
    /// @dev The maker this swap is settling with.
    address private transient _ticketMaker;
    /// @dev The strategy this swap is settling against.
    bytes32 private transient _ticketStrategyHash;
    /// @dev True while a swap is in progress. Guards against a nested `swapExactIn`.
    bool private transient _swapInProgress;

    /* --------------------------------------------------------------------- */
    /*  Events                                                                */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Emitted once per completed swap through this periphery.
     * @dev Aqua's own `Pulled`/`Pushed` events do not name the taker or the recipient, so this is
     *      the only record that says who traded and who was paid.
     * @param taker The address that called `swapExactIn` and paid the input token.
     * @param recipient The address the output token was sent to.
     * @param tokenIn The token sold.
     * @param tokenOut The token bought.
     * @param amountIn The exact amount sold.
     * @param amountOut The amount bought, as computed and executed by the app.
     */
    event Swapped(
        address indexed taker,
        address indexed recipient,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /* --------------------------------------------------------------------- */
    /*  Errors                                                                */
    /* --------------------------------------------------------------------- */

    /// @notice `xycSwapCallback` was called outside a swap this contract started, or by an address
    ///         other than `APP`.
    /// @param caller The address that called the callback.
    /// @param expected The only address that may: `APP`.
    error UnexpectedCallback(address caller, address expected);

    /// @notice The callback named a token this swap never pulled.
    /// @param provided The token the callback asked to push.
    /// @param expected The token this swap pulled.
    error UnexpectedCallbackToken(address provided, address expected);

    /// @notice The callback named an amount this swap never pulled.
    /// @param provided The amount the callback asked to push.
    /// @param expected The amount this swap pulled.
    error UnexpectedCallbackAmount(uint256 provided, uint256 expected);

    /// @notice The callback named a maker or strategy this swap is not settling with.
    /// @param provided The strategy hash the callback named.
    /// @param expected The strategy hash this swap named.
    error UnexpectedCallbackStrategy(bytes32 provided, bytes32 expected);

    /// @notice The app returned without ever settling through this contract's callback.
    error CallbackNeverHappened();

    /// @notice A swap cannot be started while one is already in progress.
    error SwapAlreadyInProgress();

    /// @notice This transaction was mined after the deadline the caller set.
    /// @param deadline The deadline the caller set, in unix seconds.
    /// @param nowTimestamp The timestamp of the block it was mined in.
    error SwapExpired(uint256 deadline, uint256 nowTimestamp);

    /* --------------------------------------------------------------------- */
    /*  Constructor                                                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Deploys the periphery against one Aqua deployment and one XYCSwap app.
     * @param aqua_ The canonical Aqua deployment (Ethereum Sepolia: 0x1111113ccf…6a90a).
     * @param app_ The XYCSwap app this periphery trades through, deployed beforehand.
     */
    constructor(IAqua aqua_, XYCSwap app_) {
        AQUA = aqua_;
        APP = app_;
    }

    /* --------------------------------------------------------------------- */
    /*  Trading                                                               */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Sell an exact amount of one of a strategy's two tokens for the other. Approve this
     *         contract for `amountIn` of the input token first. Emits `Swapped`.
     * @dev Holds nothing at the end: the app consumes the whole input. Nothing is ever refunded
     *      from this contract's balance — see the note on the contract about mis-sent tokens.
     * @param strategy The strategy, exactly as it was shipped. `keccak256(abi.encode(strategy))`
     *        must equal the `strategyHash` Aqua holds, or the app reverts.
     * @param zeroForOne True to sell `strategy.token0` for `strategy.token1`, false for the other
     *        direction.
     * @param amountIn The exact amount of the input token to sell, in its own base units.
     * @param amountOutMin The least output you will accept, in the other token's base units. The
     *        swap reverts below it. Never pass 0 from a user interface.
     * @param to Who receives the output token. Pass the zero address to mean "me".
     * @param deadline Unix seconds. The swap reverts if it is mined after this. Use roughly five
     *        minutes from now; a transaction that sits unmined executes against moved prices.
     * @return amountOut The output amount, as computed and executed by the app.
     */
    function swapExactIn(
        XYCSwap.Strategy calldata strategy,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert SwapExpired(deadline, block.timestamp);
        if (_swapInProgress) revert SwapAlreadyInProgress();

        IERC20 tokenIn = IERC20(zeroForOne ? strategy.token0 : strategy.token1);
        address recipient = to == address(0) ? msg.sender : to;

        // Pull first, then write the ticket: a token with a transfer hook cannot observe a ticket
        // that does not exist yet.
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);

        _swapInProgress = true;
        _ticketToken = address(tokenIn);
        _ticketAmount = amountIn;
        _ticketMaker = strategy.maker;
        _ticketStrategyHash = keccak256(abi.encode(strategy));

        amountOut = APP.swapExactIn(strategy, zeroForOne, amountIn, amountOutMin, recipient, "");

        // The callback clears the ticket. If it is still here, the app never settled through us,
        // and this contract is still holding the caller's money.
        if (_ticketToken != address(0)) revert CallbackNeverHappened();
        _swapInProgress = false;

        emit Swapped(
            msg.sender,
            recipient,
            address(tokenIn),
            zeroForOne ? strategy.token1 : strategy.token0,
            amountIn,
            amountOut
        );
    }

    /**
     * @notice Called by the app, during a swap, to collect the input token. Not for humans: it
     *         reverts for every caller except `APP`, and only while a swap started by this
     *         contract is in progress.
     * @dev The ticket written by `swapExactIn` is checked field by field and cleared before the
     *      external calls, so exactly one callback is possible per swap and only for the token,
     *      amount, maker and strategy that swap named.
     * @param tokenIn The token the app wants pushed. Must be the one this swap pulled.
     * @param amountIn The amount the app wants pushed. Must be the one this swap pulled.
     * @param maker The maker whose Aqua balance is credited. Must be this swap's maker.
     * @param app The app calling back. Must be `APP`.
     * @param strategyHash The strategy being settled. Must be this swap's strategy.
     */
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
        address expectedToken = _ticketToken;
        if (expectedToken == address(0)) revert UnexpectedCallback(msg.sender, address(0));
        if (msg.sender != address(APP) || app != address(APP)) revert UnexpectedCallback(msg.sender, address(APP));
        if (tokenIn != expectedToken) revert UnexpectedCallbackToken(tokenIn, expectedToken);
        if (amountIn != _ticketAmount) revert UnexpectedCallbackAmount(amountIn, _ticketAmount);
        if (strategyHash != _ticketStrategyHash) {
            revert UnexpectedCallbackStrategy(strategyHash, _ticketStrategyHash);
        }
        if (maker != _ticketMaker) revert UnexpectedCallbackStrategy(strategyHash, _ticketStrategyHash);

        // Spend the ticket before the external calls: one callback per swap, and this is it.
        _ticketToken = address(0);
        _ticketAmount = 0;
        _ticketMaker = address(0);
        _ticketStrategyHash = bytes32(0);

        IERC20(tokenIn).forceApprove(address(AQUA), amountIn);
        AQUA.push(maker, app, strategyHash, tokenIn, amountIn);
    }

    /* --------------------------------------------------------------------- */
    /*  Metadata                                                              */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The version of this contract's interface and behaviour.
     * @return semver A semantic version string.
     */
    function version() external pure returns (string memory semver) {
        return "1.0.0";
    }
}
