// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAqua} from "../../contracts/aqua/src/interfaces/IAqua.sol";
import {XYCSwap} from "../../contracts/aqua/examples/apps/XYCSwap.sol";
import {IXYCSwapCallback} from "../../contracts/aqua/examples/apps/interfaces/IXYCSwapCallback.sol";
import {XYCSwapTaker} from "../../contracts/aqua/XYCSwapTaker.sol";
import {BankRockAquaBase} from "../aqua/base/BankRockAquaBase.sol";

/**
 * @title EvilXYCSwapApp — an "AquaApp" that is nothing but a callback trigger
 *
 * @dev It presents XYCSwap's `swapExactIn` selector and does exactly one thing: call
 *      `xycSwapCallback` back into whoever called it, `times` times, naming a token, an amount,
 *      a maker and a strategy hash of its own choosing. It never pulls anything for the taker
 *      and never prices anything.
 *
 *      Since the F-6 fix the app is an `immutable APP` rather than a parameter, so this app can
 *      only be reached through a periphery deployed against it. The tests below deploy exactly
 *      that — `evilTaker` — which is the strongest remaining position an attacker can hold: they
 *      own the app their own periphery trusts. Everything the periphery still refuses in that
 *      position, it refuses to any app.
 */
contract EvilXYCSwapApp {
    address public token;
    uint256 public amount;
    uint256 public times;
    address public maker;
    bytes32 public strategyHash;
    uint256 public callbacks;

    function arm(address token_, uint256 amount_, uint256 times_, address maker_, bytes32 strategyHash_) external {
        token = token_;
        amount = amount_;
        times = times_;
        maker = maker_;
        strategyHash = strategyHash_;
    }

    /// @dev Deliberately the exact signature — and therefore the exact selector — of
    ///      `XYCSwap.swapExactIn`, so `XYCSwapTaker` dispatches to it.
    function swapExactIn(
        XYCSwap.Strategy calldata,
        bool,
        uint256,
        uint256,
        address,
        bytes calldata
    ) external returns (uint256 amountOut) {
        for (uint256 i = 0; i < times; i++) {
            callbacks++;
            IXYCSwapCallback(msg.sender).xycSwapCallback(
                token, token, amount, 0, maker, address(this), strategyHash, ""
            );
        }
        return 0;
    }
}

/**
 * @title XYCSwapTakerAudit — proof-of-concept tests for the taker findings in
 *        `contracts/audit/2026-09-12-findings.md`
 *
 * @dev Every test here failed against the source as audited on 2026-09-12 and passes against the
 *      hardened source. The fixture is the same one the shipped Aqua suite uses
 *      (`test/aqua/base/BankRockAquaBase.sol`): a real `Aqua`, a real `XYCSwap`, a real strategy
 *      shipped by the Rock Account, and this contract as the taker.
 *
 *      Interface note (recorded in `contracts/audit/2026-09-12-changes.md`): fixing F-6 removed
 *      the `app` parameter from `swapExactIn` and fixing F-8 added `deadline`, so every call site
 *      here changed shape. The F-6 and F-7 tests additionally had to be re-expressed against a
 *      periphery deployed *against the evil app*, because the old expression of the attack — pass
 *      an arbitrary app to the honest periphery — is no longer reachable at all, which is the fix.
 */
contract XYCSwapTakerAuditTest is BankRockAquaBase {
    uint256 constant FEE_BPS = 30;

    uint256 constant MAKER_USDC = 5_000 * ONE_USDC;
    uint256 constant MAKER_WETH = 3 * ONE_WETH;
    uint256 constant TAKER_USDC = 1_000 * ONE_USDC;
    uint256 constant TAKER_WETH = 1 * ONE_WETH;

    uint256 constant SHIP_USDC = 2_000 * ONE_USDC;
    uint256 constant SHIP_WETH = 1 * ONE_WETH;

    /// @dev How much someone mis-sends straight to the periphery (Flow: a user pastes the taker
    ///      address into a wallet's "send" field instead of the Rock Account's).
    uint256 constant STRANDED = 1_000 * ONE_USDC;

    address constant EVIL_MAKER = address(0x00000000000000000000000000000000000000e1);

    XYCSwap.Strategy strategy;
    bytes32 strategyHash;

    EvilXYCSwapApp evil;
    XYCSwapTaker evilTaker;
    XYCSwap.Strategy evilStrategy;
    bytes32 evilStrategyHash;

    function setUp() public {
        _deploy(MAKER_USDC, MAKER_WETH, TAKER_USDC, TAKER_WETH);
        strategy = _strategy(ROCK_ID, 0, FEE_BPS);
        strategyHash = _ship(strategy, SHIP_USDC, SHIP_WETH);

        evil = new EvilXYCSwapApp();

        // The attacker's periphery: deployed against their own app, which is the most authority
        // over a `XYCSwapTaker` an attacker can obtain once the app is immutable.
        evilTaker = new XYCSwapTaker(IAqua(address(aqua)), XYCSwap(address(evil)));
        usdc.approve(address(evilTaker), type(uint256).max);

        // The attacker's own strategy, shipped by their own maker to their own app, so that
        // `Aqua.push` has somewhere to credit. Nothing here touches the rock's strategy. It is a
        // real `XYCSwap.Strategy` so that its hash is what the periphery's ticket will compute.
        evilStrategy = XYCSwap.Strategy({
            maker: EVIL_MAKER,
            token0: address(usdc),
            token1: address(weth),
            feeBps: FEE_BPS,
            salt: keccak256("evil")
        });
        evilStrategyHash = _hash(evilStrategy);

        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 0;
        vm.prank(EVIL_MAKER);
        aqua.ship(address(evil), abi.encode(evilStrategy), tokens, amounts);
    }

    /* ------------------------------------------------------------------ */
    /* F-5 — tokens sent to the periphery by mistake                       */
    /* ------------------------------------------------------------------ */

    /**
     * F-5 (Medium). `swapExactIn` used to end by transferring `tokenIn.balanceOf(address(this))`
     * to `msg.sender`, so every stray token of that denomination went to the next person who
     * swapped it, for the price of a one-wei trade.
     *
     * THE FIX: the refund is gone entirely. The app consumes the whole input, so the honest path
     * never had a residue to return; mis-sent tokens stay where they were sent and the contract
     * NatSpec says so in as many words.
     */
    function testAudit_F5_strayTokensAreNotPaidOutToTheNextCaller() public {
        usdc.mint(address(taker), STRANDED);
        uint256 mine = usdc.balanceOf(address(this));

        taker.swapExactIn(strategy, true, ONE_USDC, 0, address(this), _deadline());

        require(
            usdc.balanceOf(address(this)) == mine - ONE_USDC,
            "a swap must pay the caller its output token only, never someone else's stray USDC"
        );
        require(usdc.balanceOf(address(taker)) == STRANDED, "the stray balance must still be there");
    }

    /* ------------------------------------------------------------------ */
    /* F-6 — the callback believed every field the app handed it            */
    /* ------------------------------------------------------------------ */

    /**
     * F-6 (Medium). The callback used to check only *who* called it, then approve and push
     * whatever token, amount, maker and strategy that caller named — authority over anything the
     * periphery was holding.
     *
     * THE FIX MUST MAKE TRUE: the periphery pushes only the token and amount of the swap it
     * itself started, to the maker and strategy that swap named. Here the attacker owns the app
     * their periphery is bound to and still cannot make it move the stray balance.
     */
    function testAudit_F6_anArbitraryAppCannotPushTokensThePeripheryNeverPulled() public {
        require(
            EvilXYCSwapApp.swapExactIn.selector == XYCSwap.swapExactIn.selector,
            "control: the evil app must present XYCSwap's swapExactIn selector"
        );

        usdc.mint(address(evilTaker), STRANDED);
        // A swap that pulls one unit, and an app that asks for the whole stray balance.
        evil.arm(address(usdc), STRANDED, 1, EVIL_MAKER, evilStrategyHash);

        try this.swapOneViaEvilTaker() {
            require(false, "the periphery must refuse an amount its swap never pulled");
        } catch {
            // Expected: UnexpectedCallbackAmount(STRANDED, 1).
        }

        require(usdc.balanceOf(EVIL_MAKER) == 0, "nothing may reach the attacker's maker");
        require(usdc.balanceOf(address(evilTaker)) == STRANDED, "nothing may leave the periphery here");
    }

    /**
     * F-6, second half: the honest periphery answers its callback to nobody but its own app, and
     * only inside a swap. A direct call from anywhere finds no ticket.
     */
    function testAudit_F6_theCallbackRejectsEveryCallerOutsideASwap() public {
        try taker.xycSwapCallback(address(usdc), address(weth), ONE_USDC, 0, MAKER, address(app), strategyHash, "") {
            require(false, "the callback must revert outside a swap");
        } catch {
            // Expected: UnexpectedCallback(caller, address(0)).
        }
        require(usdc.balanceOf(address(taker)) == 0, "the periphery holds nothing between swaps");
    }

    /* ------------------------------------------------------------------ */
    /* F-7 — a second callback inside one swap                             */
    /* ------------------------------------------------------------------ */

    /**
     * F-7 (Medium). The transient gate was a window, not a ticket: it was set for the whole
     * duration of the app call and never consumed, so one swap admitted unlimited callbacks.
     *
     * THE FIX MUST MAKE TRUE: the callback spends the ticket before it does anything, so the
     * second callback of one swap reverts. Here the first callback is entirely legitimate — right
     * token, right amount, right maker, right strategy — and the second one still fails.
     */
    function testAudit_F7_aSecondCallbackInsideOneSwapReverts() public {
        require(
            EvilXYCSwapApp.swapExactIn.selector == XYCSwap.swapExactIn.selector,
            "control: the evil app must present XYCSwap's swapExactIn selector"
        );

        usdc.mint(address(evilTaker), STRANDED);
        // Everything matches the swap below, so only the *count* can reject the second callback.
        evil.arm(address(usdc), ONE_USDC, 2, EVIL_MAKER, evilStrategyHash);

        try this.swapOneViaEvilTaker() {
            require(false, "the second callback of one swap must revert");
        } catch {
            // Expected: UnexpectedCallback(msg.sender, address(0)).
        }

        require(usdc.balanceOf(EVIL_MAKER) == 0, "nothing may reach the attacker's maker");
        require(usdc.balanceOf(address(evilTaker)) == STRANDED, "the stray balance is untouched");
    }

    /**
     * F-7, the other half of the same ticket: an app that returns without ever calling back has
     * left the caller's money in the periphery. The swap must not report success.
     */
    function testAudit_F7_anAppThatNeverCallsBackCannotSucceed() public {
        evil.arm(address(usdc), ONE_USDC, 0, EVIL_MAKER, evilStrategyHash);

        try this.swapOneViaEvilTaker() {
            require(false, "a swap whose app never settled must revert");
        } catch {
            // Expected: CallbackNeverHappened().
        }
    }

    /* ------------------------------------------------------------------ */
    /* F-8 — swapExactIn had no deadline                                   */
    /* ------------------------------------------------------------------ */

    /**
     * F-8 (Medium). A signed transaction that does not get mined stays valid, so a visitor's swap
     * could sit in a mempool (or a bundler's queue) and execute later against moved reserves.
     *
     * THE FIX MUST MAKE TRUE: `swapExactIn` takes a `deadline` and reverts past it. This test is
     * the one the audit wrote out in the F-8 section; it could not be written before the fix
     * because the parameter did not exist.
     */
    function testAudit_F8_aSwapPastItsDeadlineReverts() public {
        uint256 deadline = block.timestamp + 60;
        vm.warp(deadline + 1);

        try taker.swapExactIn(strategy, true, ONE_USDC, 0, address(this), deadline) {
            require(false, "a swap must not execute after its deadline");
        } catch {
            // Expected: SwapExpired(deadline, block.timestamp).
        }
    }

    /// @dev A swap at exactly the deadline is still valid — the boundary is inclusive, as it is
    ///      everywhere else in this project.
    function testAudit_F8_aSwapAtExactlyItsDeadlineSucceeds() public {
        uint256 deadline = block.timestamp + 60;
        vm.warp(deadline);

        uint256 amountOut = taker.swapExactIn(strategy, true, ONE_USDC, 0, address(this), deadline);
        require(amountOut > 0, "the swap at the deadline second must go through");
    }

    /* ------------------------------------------------------------------ */
    /* N-2 — the recipient must be somewhere the money can actually go     */
    /* ------------------------------------------------------------------ */

    /**
     * N-2 (Low, re-review). `to` was passed through to the app unchecked, and
     * `to == address(this)` sends the output into a contract whose documented policy is that
     * tokens sent to it are lost — the one address every visitor has just had in their clipboard,
     * because step one of a swap is approving it.
     *
     * THE FIX MUST MAKE TRUE: the periphery refuses to be its own recipient.
     */
    function testReview_N2_thePeripheryRefusesToBeItsOwnRecipient() public {
        uint256 mine = usdc.balanceOf(address(this));

        try taker.swapExactIn(strategy, true, ONE_USDC, 0, address(taker), _deadline()) {
            require(false, "the periphery must not pay itself: those tokens are unrecoverable");
        } catch {
            // Expected: InvalidRecipient(address(taker)).
        }

        require(usdc.balanceOf(address(this)) == mine, "nothing was spent");
        require(weth.balanceOf(address(taker)) == 0, "and nothing was stranded");
    }

    /**
     * N-2, second half. The zero address used to mean "pay the caller". A sentinel that turns what
     * every reader takes for a burn address into a payout is exactly the ambiguity Part 2 exists
     * to remove, so it is rejected too and the recipient must be named.
     */
    function testReview_N2_theZeroSentinelIsGoneAndTheRecipientMustBeNamed() public {
        try taker.swapExactIn(strategy, true, ONE_USDC, 0, address(0), _deadline()) {
            require(false, "the zero address must not be accepted as a recipient");
        } catch {
            // Expected: InvalidRecipient(address(0)).
        }

        // Naming yourself explicitly is what replaces it, and it works.
        uint256 wethBefore = weth.balanceOf(address(this));
        uint256 amountOut = taker.swapExactIn(strategy, true, ONE_USDC, 0, address(this), _deadline());
        require(amountOut > 0, "an explicit recipient swaps normally");
        require(weth.balanceOf(address(this)) == wethBefore + amountOut, "and is paid");
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    /// @dev External so the tests above can `try` it. Pulls one unit of USDC from this contract
    ///      through the attacker's own periphery.
    function swapOneViaEvilTaker() external returns (uint256) {
        return evilTaker.swapExactIn(evilStrategy, true, ONE_USDC, 0, address(this), _deadline());
    }
}
