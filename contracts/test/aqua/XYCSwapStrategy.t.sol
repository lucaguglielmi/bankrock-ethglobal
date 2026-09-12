// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAqua} from "../../contracts/aqua/src/interfaces/IAqua.sol";
import {XYCSwap} from "../../contracts/aqua/examples/apps/XYCSwap.sol";
import {XYCSwapTaker} from "../../contracts/aqua/XYCSwapTaker.sol";
import {BankRockAquaBase} from "./base/BankRockAquaBase.sol";

/**
 * @title The Aqua strategy lifecycle a rock goes through
 *
 * @dev One rock, one strategy: ship, quote, swap both ways, watch the fee land, dock. Every
 *      assertion checks the two balances spec 04 insists are different things:
 *
 *        actual  — `ERC20.balanceOf(maker)`, the tokens that never left the maker's wallet;
 *        virtual — `Aqua.safeBalances(maker, app, strategyHash, token0, token1)`, the allowance
 *                  this one strategy may trade against.
 *
 *      Shared-reserve behaviour (two strategies over one balance) is in `SharedReserve.t.sol`.
 */
contract XYCSwapStrategyTest is BankRockAquaBase {
    uint256 constant FEE_BPS = 30; // 0.3%

    uint256 constant MAKER_USDC = 5_000 * ONE_USDC;
    uint256 constant MAKER_WETH = 3 * ONE_WETH;
    uint256 constant TAKER_USDC = 1_000 * ONE_USDC;
    uint256 constant TAKER_WETH = 1 * ONE_WETH;

    /// The reserve this rock commits to its one stream: 2,000 USDC against 1 WETH.
    uint256 constant SHIP_USDC = 2_000 * ONE_USDC;
    uint256 constant SHIP_WETH = 1 * ONE_WETH;

    XYCSwap.Strategy strategy;
    bytes32 strategyHash;

    function setUp() public {
        _deploy(MAKER_USDC, MAKER_WETH, TAKER_USDC, TAKER_WETH);
        strategy = _strategy(ROCK_ID, 0, FEE_BPS);
        strategyHash = _ship(strategy, SHIP_USDC, SHIP_WETH);
    }

    /* ------------------------------------------------------------------ */
    /* Encoding                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * The single cross-check between this suite and `web/src/lib/aqua/strategy.ts`.
     *
     * Every field is a literal, so the hash is reproducible anywhere. `encodeStrategy()` and
     * `strategyHash()` in TypeScript assert the same three values; if either side's encoding
     * drifts, one of the two suites goes red.
     */
    function testStrategyEncodingMatchesTheTypeScriptLibrary() public pure {
        require(
            SALT_DOMAIN == 0x81ab6ad9698f8f0486cca1eb375761a4383f19d2b2ea00b9c211b6b10541fdcf,
            "salt domain drifted"
        );

        bytes32 salt = keccak256(abi.encode(SALT_DOMAIN, uint256(42), uint256(0)));
        require(salt == 0x1fe63c2efefd5114495a79101a4947d1aa6b9f5fdcdf9e30bd69407274f3499d, "salt drifted");

        XYCSwap.Strategy memory fixedStrategy = XYCSwap.Strategy({
            maker: address(0x00000000000000000000000000000000000000A1),
            token0: address(0x00000000000000000000000000000000000000C0),
            token1: address(0x00000000000000000000000000000000000000C1),
            feeBps: 30,
            salt: salt
        });
        require(
            keccak256(abi.encode(fixedStrategy))
                == 0x93edb6bc48131420e723b96c4ed3088624ba00461235d924c276dc1815b92c3e,
            "strategy hash drifted"
        );
    }

    /// `strategyHash` is `keccak256(strategy)` — Aqua hashes the bytes it is handed, nothing else.
    function testShipReturnsKeccakOfTheStrategyBytes() public view {
        require(strategyHash == keccak256(abi.encode(strategy)), "strategyHash != keccak256(strategy)");
        require(strategy.salt == _salt(ROCK_ID, 0), "rock id must be the salt preimage");
    }

    /* ------------------------------------------------------------------ */
    /* Ship                                                                */
    /* ------------------------------------------------------------------ */

    function testShipCreatesVirtualBalancesWithoutMovingTokens() public view {
        (uint256 vUsdc, uint256 vWeth) = _virtual(strategyHash);
        require(vUsdc == SHIP_USDC, "virtual USDC wrong");
        require(vWeth == SHIP_WETH, "virtual WETH wrong");

        // Not one token moved: shipping is an allowance, not a deposit.
        require(usdc.balanceOf(MAKER) == MAKER_USDC, "maker USDC moved on ship");
        require(weth.balanceOf(MAKER) == MAKER_WETH, "maker WETH moved on ship");
        require(usdc.balanceOf(address(aqua)) == 0, "Aqua must never custody tokens");
        require(weth.balanceOf(address(aqua)) == 0, "Aqua must never custody tokens");

        (, uint8 tokensCount) = aqua.rawBalances(MAKER, address(app), strategyHash, address(usdc));
        require(tokensCount == 2, "tokensCount should be 2");
    }

    function testStrategiesAreImmutable() public {
        try this.shipAgain() {
            require(false, "re-shipping the same strategy must revert");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == IAqua.StrategiesMustBeImmutable.selector,
                "wrong error re-shipping"
            );
        }
    }

    function shipAgain() external {
        _ship(strategy, SHIP_USDC, SHIP_WETH);
    }

    /* ------------------------------------------------------------------ */
    /* Swap                                                                */
    /* ------------------------------------------------------------------ */

    function testSwapUsdcForWethMovesActualAndVirtualBalances() public {
        uint256 amountIn = 100 * ONE_USDC;
        uint256 expectedOut = _expectedOut(SHIP_USDC, SHIP_WETH, amountIn, FEE_BPS);

        // The app's own view is the quote source (spec 04 "Quoting"); it must agree exactly.
        require(app.quoteExactIn(strategy, true, amountIn) == expectedOut, "quote != formula");
        // The same number is pinned in web/src/lib/aqua/quote.test.ts, so the TypeScript quote
        // cannot drift from the contract without one of the two suites failing.
        require(expectedOut == 47_482_973_758_155_927, "100 USDC in at 30 bps on 2000/1");

        uint256 takerWethBefore = weth.balanceOf(address(this));
        uint256 makerUsdcBefore = usdc.balanceOf(MAKER);
        uint256 makerWethBefore = weth.balanceOf(MAKER);

        uint256 amountOut = taker.swapExactIn(strategy, true, amountIn, expectedOut, address(this), _deadline());
        require(amountOut == expectedOut, "amountOut != quote");

        // Actual balances — real ERC-20 transfers out of and into the maker's own wallet.
        require(usdc.balanceOf(MAKER) == makerUsdcBefore + amountIn, "maker did not receive USDC");
        require(weth.balanceOf(MAKER) == makerWethBefore - amountOut, "maker did not pay WETH");
        require(weth.balanceOf(address(this)) == takerWethBefore + amountOut, "taker did not receive WETH");
        require(usdc.balanceOf(address(taker)) == 0, "periphery must hold nothing");

        // Virtual balances — the strategy's allowance moved by the same amounts.
        (uint256 vUsdc, uint256 vWeth) = _virtual(strategyHash);
        require(vUsdc == SHIP_USDC + amountIn, "virtual USDC wrong after swap");
        require(vWeth == SHIP_WETH - amountOut, "virtual WETH wrong after swap");
    }

    function testSwapWethForUsdcMovesActualAndVirtualBalances() public {
        uint256 amountIn = ONE_WETH / 10; // 0.1 WETH
        uint256 expectedOut = _expectedOut(SHIP_WETH, SHIP_USDC, amountIn, FEE_BPS);
        require(app.quoteExactIn(strategy, false, amountIn) == expectedOut, "quote != formula");
        require(expectedOut == 181_322_178, "0.1 WETH in at 30 bps on 2000/1"); // also in quote.test.ts

        uint256 takerUsdcBefore = usdc.balanceOf(address(this));
        uint256 amountOut = taker.swapExactIn(strategy, false, amountIn, expectedOut, address(this), _deadline());

        require(amountOut == expectedOut, "amountOut != quote");
        require(usdc.balanceOf(address(this)) == takerUsdcBefore + amountOut, "taker did not receive USDC");

        (uint256 vUsdc, uint256 vWeth) = _virtual(strategyHash);
        require(vWeth == SHIP_WETH + amountIn, "virtual WETH wrong after swap");
        require(vUsdc == SHIP_USDC - amountOut, "virtual USDC wrong after swap");
    }

    /**
     * Where the fee lands.
     *
     * XYCSwap keeps no fee accumulator. The taker pays `amountIn` in full — it is pushed into the
     * maker's wallet and credited to the strategy's virtual balance — while the output is priced
     * off `amountIn * (10000 - feeBps) / 10000`. The fee is therefore the part of the input the
     * curve never paid for: it stays in the maker's reserve and shows up as growth of `x * y`.
     */
    function testFeeStaysInTheMakersReserveAndGrowsTheInvariant() public {
        uint256 amountIn = 100 * ONE_USDC;
        uint256 kBefore = SHIP_USDC * SHIP_WETH;

        uint256 amountOut = taker.swapExactIn(strategy, true, amountIn, 0, address(this), _deadline());

        (uint256 vUsdc, uint256 vWeth) = _virtual(strategyHash);
        require(vUsdc * vWeth > kBefore, "fee must grow the invariant");

        // The maker's credited input is the gross amount; the curve only ever saw the net.
        uint256 fee = (amountIn * FEE_BPS) / 10_000;
        uint256 netIn = amountIn - fee;
        require(vUsdc == SHIP_USDC + amountIn, "gross input must be credited");
        require(amountOut == (netIn * SHIP_WETH) / (SHIP_USDC + netIn), "output must price the net input");

        // Same trade at zero fee pays the taker strictly more — that difference *is* the fee.
        XYCSwap.Strategy memory freeStrategy = _strategy(ROCK_ID, 1, 0);
        bytes32 freeHash = _ship(freeStrategy, SHIP_USDC, SHIP_WETH);
        require(freeHash != strategyHash, "two salts, two strategies");
        uint256 freeOut = app.quoteExactIn(freeStrategy, true, amountIn);
        require(freeOut > amountOut, "the 30 bps strategy must pay the taker less");
    }

    /* ------------------------------------------------------------------ */
    /* Limits                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * `quoteExactOut` is not the inverse of `quoteExactIn` in the reference app: the fee is taken
     * off the input in one and off the output in the other, so buying back exactly what 100 USDC
     * bought costs ~30 bps more. Pinned here and in web/src/lib/aqua/quote.test.ts so the
     * TypeScript mirror keeps reproducing the contract rather than the textbook.
     */
    function testQuoteExactOutIsNotTheInverseOfQuoteExactIn() public view {
        uint256 amountIn = 100 * ONE_USDC;
        uint256 amountOut = app.quoteExactIn(strategy, true, amountIn);
        uint256 backIn = app.quoteExactOut(strategy, true, amountOut);
        require(backIn == 100_015_003, "quoteExactOut drifted");
        require(backIn > amountIn, "the round trip must cost more, not less");
    }

    /// Asking for more of a token than the strategy's virtual balance holds cannot be quoted.
    function testQuoteBeyondVirtualLiquidityReverts() public {
        try app.quoteExactOut(strategy, true, SHIP_WETH) {
            require(false, "quoting the whole virtual balance out must revert");
        } catch {
            // arithmetic underflow inside `_quoteExactOut`: balanceOut - amountOutWithFee
        }
    }

    /**
     * Virtual liquidity is not a deposit: a strategy may be shipped over more than the wallet
     * holds, and then the *wallet* is the binding constraint. The swap reverts inside the ERC-20
     * transfer, not inside Aqua, and nothing is left half-done.
     */
    function testSwapRevertsWhenTheWalletCannotCoverTheVirtualBalance() public {
        // Stream 2 claims 3 WETH; the maker's wallet holds 3 WETH in total and stream 0 has
        // already committed 1 of them. Ask for an output bigger than the wallet.
        XYCSwap.Strategy memory greedy = _strategy(ROCK_ID, 2, FEE_BPS);
        bytes32 greedyHash = _ship(greedy, 10_000 * ONE_USDC, 10 * ONE_WETH);

        (, uint256 vWeth) = _virtual(greedyHash);
        require(vWeth == 10 * ONE_WETH, "virtual WETH should be 10");
        require(weth.balanceOf(MAKER) == MAKER_WETH, "wallet still holds only 3 WETH");

        // 1,000 USDC in against a 10,000/10 curve quotes ~0.9 WETH out, which the wallet covers;
        // a swap ten times that size does not.
        try this.swapVia(greedy, true, 1_000 * ONE_USDC) returns (uint256 out) {
            require(out > 0, "small swap should succeed");
        } catch {
            require(false, "a swap the wallet can cover must succeed");
        }

        usdc.mint(address(this), 100_000 * ONE_USDC);
        try this.swapVia(greedy, true, 100_000 * ONE_USDC) {
            require(false, "a swap beyond the wallet balance must revert");
        } catch {
            // ERC20InsufficientBalance inside Aqua.pull's safeTransferFrom
        }
    }

    function swapVia(XYCSwap.Strategy memory s, bool zeroForOne, uint256 amountIn)
        external
        returns (uint256)
    {
        return taker.swapExactIn(s, zeroForOne, amountIn, 0, address(this), _deadline());
    }

    function testSlippageBoundIsEnforced() public {
        uint256 amountIn = 100 * ONE_USDC;
        uint256 quoted = app.quoteExactIn(strategy, true, amountIn);
        try this.swapWithMinOut(amountIn, quoted + 1) {
            require(false, "a swap below amountOutMin must revert");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == XYCSwap.InsufficientOutputAmount.selector,
                "wrong error for slippage"
            );
        }
    }

    function swapWithMinOut(uint256 amountIn, uint256 minOut) external returns (uint256) {
        return taker.swapExactIn(strategy, true, amountIn, minOut, address(this), _deadline());
    }

    /* ------------------------------------------------------------------ */
    /* The taker periphery is not optional                                 */
    /* ------------------------------------------------------------------ */

    /**
     * A taker that does not implement `IXYCSwapCallback` cannot trade against XYCSwap at all.
     * This test contract is exactly that case, and it is why `XYCSwapTaker` exists: an EOA or a
     * plain Safe is in the same position.
     */
    function testATakerWithoutTheCallbackCannotSwap() public {
        usdc.approve(address(app), type(uint256).max);
        try this.swapDirectly(100 * ONE_USDC) {
            require(false, "swapping without the callback must revert");
        } catch {
            // MissingTakerAquaPush — the app pulled the output, called back, and no push arrived.
        }
    }

    function swapDirectly(uint256 amountIn) external returns (uint256) {
        return app.swapExactIn(strategy, true, amountIn, 0, address(this), "");
    }

    /// The periphery's callback is public. Called outside a swap it must refuse.
    function testThePeripheryCallbackRejectsOutsiders() public {
        try taker.xycSwapCallback(address(usdc), address(weth), 1, 1, MAKER, address(app), strategyHash, "") {
            require(false, "an unsolicited callback must revert");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == XYCSwapTaker.UnexpectedCallback.selector,
                "wrong error for unsolicited callback"
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* Dock                                                                */
    /* ------------------------------------------------------------------ */

    /**
     * Docking ends the strategy. It moves no tokens, because none were ever taken: the maker's
     * "withdrawal" is simply the fact that its wallet balance was always its own (Flow H).
     */
    function testDockEndsTheStrategyAndLeavesTheWalletIntact() public {
        taker.swapExactIn(strategy, true, 100 * ONE_USDC, 0, address(this), _deadline());

        uint256 usdcBefore = usdc.balanceOf(MAKER);
        uint256 wethBefore = weth.balanceOf(MAKER);

        _dock(strategyHash);

        require(usdc.balanceOf(MAKER) == usdcBefore, "dock must not move USDC");
        require(weth.balanceOf(MAKER) == wethBefore, "dock must not move WETH");

        try this.readVirtual(strategyHash) {
            require(false, "safeBalances must revert for a docked strategy");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == IAqua.SafeBalancesForTokenNotInActiveStrategy.selector,
                "wrong error after dock"
            );
        }

        try this.swapVia(strategy, true, 10 * ONE_USDC) {
            require(false, "a docked strategy must not trade");
        } catch {
            // the app's own _getInAndOut call to safeBalances reverts first
        }
    }

    function readVirtual(bytes32 hash_) external view returns (uint256, uint256) {
        return _virtual(hash_);
    }

    /// A docked strategy can never be re-shipped: its hash is burned (`tokensCount == 0xff`).
    function testADockedStrategyCannotBeReshipped() public {
        _dock(strategyHash);
        try this.shipAgain() {
            require(false, "re-shipping a docked strategy must revert");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == IAqua.StrategiesMustBeImmutable.selector,
                "wrong error re-shipping a docked strategy"
            );
        }
    }
}
