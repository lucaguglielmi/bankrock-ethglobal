// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAqua} from "../../contracts/aqua/src/interfaces/IAqua.sol";
import {XYCSwap} from "../../contracts/aqua/examples/apps/XYCSwap.sol";
import {BankRockAquaBase} from "./base/BankRockAquaBase.sol";

/**
 * @title Two strategies, one reserve — the property spec 04 says the demo must show
 *
 * @dev "A single strategy would technically integrate Aqua but would fail to communicate its
 *      distinctive value." So one rock ships two streams over the *same* wallet balance:
 *
 *        stream 0 — 30 bps, 2,000 USDC / 1 WETH
 *        stream 1 — 5 bps,  2,000 USDC / 1 WETH
 *
 *      while the wallet holds 2,500 USDC and 0.8 WETH. The virtual allocations add up to more
 *      than the maker owns, which is the whole point: they are allowances over one reserve, not
 *      deposits into two pools. This suite pins the three consequences the UI has to honour:
 *
 *        1. neither virtual balance is a claim on separate capital, and their sum is not capital;
 *        2. a swap on one stream reduces what the other can actually execute, without touching
 *           the other's virtual balance — executable availability is
 *           `min(virtual, wallet balance, allowance)`, never `virtual` alone;
 *        3. docking one stream leaves the other running.
 */
contract SharedReserveTest is BankRockAquaBase {
    uint256 constant WIDE_FEE_BPS = 30;
    uint256 constant TIGHT_FEE_BPS = 5;

    uint256 constant MAKER_USDC = 2_500 * ONE_USDC;
    uint256 constant MAKER_WETH = (8 * ONE_WETH) / 10; // 0.8 WETH — less than *either* stream claims

    uint256 constant STREAM_USDC = 2_000 * ONE_USDC;
    uint256 constant STREAM_WETH = 1 * ONE_WETH;

    XYCSwap.Strategy wide;
    XYCSwap.Strategy tight;
    bytes32 wideHash;
    bytes32 tightHash;

    function setUp() public {
        _deploy(MAKER_USDC, MAKER_WETH, 50_000 * ONE_USDC, 10 * ONE_WETH);

        wide = _strategy(ROCK_ID, 0, WIDE_FEE_BPS);
        tight = _strategy(ROCK_ID, 1, TIGHT_FEE_BPS);

        wideHash = _ship(wide, STREAM_USDC, STREAM_WETH);
        tightHash = _ship(tight, STREAM_USDC, STREAM_WETH);
    }

    function testTwoStreamsOfOneRockAreDistinctStrategies() public view {
        require(wideHash != tightHash, "different salts must give different hashes");
        require(wide.salt == _salt(ROCK_ID, 0) && tight.salt == _salt(ROCK_ID, 1), "salt derivation");
        require(wide.maker == tight.maker, "same rock, same maker");
    }

    /// The sum of the virtual balances exceeds the wallet. It is not owned capital.
    function testVirtualAllocationsOverlapAndMustNotBeSummed() public view {
        (uint256 wideUsdc, uint256 wideWeth) = _virtual(wideHash);
        (uint256 tightUsdc, uint256 tightWeth) = _virtual(tightHash);

        require(wideUsdc == STREAM_USDC && tightUsdc == STREAM_USDC, "virtual USDC per stream");
        require(wideWeth == STREAM_WETH && tightWeth == STREAM_WETH, "virtual WETH per stream");

        require(wideUsdc + tightUsdc > usdc.balanceOf(MAKER), "the demo needs overlapping USDC");
        require(wideWeth + tightWeth > weth.balanceOf(MAKER), "the demo needs overlapping WETH");

        require(usdc.balanceOf(MAKER) == MAKER_USDC, "one reserve, untouched");
        require(weth.balanceOf(MAKER) == MAKER_WETH, "one reserve, untouched");
    }

    /**
     * The headline: trading stream 0 changes what stream 1 can do, because both draw on the same
     * wallet. Stream 1's *virtual* balance is untouched — an implementation that only read
     * `safeBalances` would show no change at all and would be lying about availability.
     */
    function testASwapOnOneStreamReducesWhatTheOtherCanExecute() public {
        (, uint256 tightWethBefore) = _virtual(tightHash);
        uint256 availableBefore = _executableWeth(tightHash);
        require(availableBefore == MAKER_WETH, "wallet is the binding constraint from the start");
        require(tightWethBefore > availableBefore, "virtual exceeds what the wallet can settle");

        // A visitor sells 1,000 USDC into the wide stream and takes WETH out of the wallet.
        uint256 amountOut = taker.swapExactIn(wide, true, 1_000 * ONE_USDC, 0, address(this), _deadline());
        require(amountOut > 0, "swap produced nothing");

        (, uint256 tightWethAfter) = _virtual(tightHash);
        require(tightWethAfter == tightWethBefore, "the other stream's virtual balance must not move");

        uint256 availableAfter = _executableWeth(tightHash);
        require(availableAfter == availableBefore - amountOut, "shared reserve did not shrink");
        require(availableAfter < tightWethAfter, "availability is capped by the wallet, not the strategy");

        // And the wide stream's own virtual WETH fell by the same amount it paid out.
        (, uint256 wideWethAfter) = _virtual(wideHash);
        require(wideWethAfter == STREAM_WETH - amountOut, "wide stream virtual WETH");
    }

    /// Draining the wallet through one stream makes the other unfillable, at any size.
    function testTheSecondStreamCannotOverdrawTheEmptiedWallet() public {
        // Take most of the WETH out through the wide stream. 3,000 USDC against a 2,000/1 curve
        // buys ~0.6 WETH, which is as much as the 0.8 WETH wallet can settle in one go.
        taker.swapExactIn(wide, true, 3_000 * ONE_USDC, 0, address(this), _deadline());
        uint256 walletWeth = weth.balanceOf(MAKER);
        require(walletWeth < STREAM_WETH / 2, "wallet should be largely drained");

        (, uint256 tightVirtualWeth) = _virtual(tightHash);
        require(tightVirtualWeth == STREAM_WETH, "tight stream still claims a full WETH");

        // A trade the tight stream's own curve is happy to quote, but the wallet cannot settle.
        uint256 amountIn = 1_500 * ONE_USDC;
        uint256 quoted = app.quoteExactIn(tight, true, amountIn);
        require(quoted > walletWeth, "pick a size the wallet cannot cover");

        try this.swapTight(amountIn) {
            require(false, "the shared wallet must stop this trade");
        } catch {
            // ERC20InsufficientBalance inside Aqua.pull
        }
    }

    function swapTight(uint256 amountIn) external returns (uint256) {
        return taker.swapExactIn(tight, true, amountIn, 0, address(this), _deadline());
    }

    /// The two streams price differently on the same reserve — the second curve of spec 04.
    function testTheTighterFeePaysTheTakerMore() public view {
        uint256 amountIn = 500 * ONE_USDC;
        require(
            app.quoteExactIn(tight, true, amountIn) > app.quoteExactIn(wide, true, amountIn),
            "5 bps must beat 30 bps on identical reserves"
        );
    }

    function testDockingOneStreamLeavesTheOtherRunning() public {
        _dock(wideHash);

        (uint256 tightUsdc, uint256 tightWeth) = _virtual(tightHash);
        require(tightUsdc == STREAM_USDC && tightWeth == STREAM_WETH, "the live stream must survive");

        uint256 out = taker.swapExactIn(tight, true, 100 * ONE_USDC, 0, address(this), _deadline());
        require(out > 0, "the live stream must still trade");

        try this.readVirtual(wideHash) {
            require(false, "the docked stream must be gone");
        } catch (bytes memory reason) {
            require(
                _selector(reason) == IAqua.SafeBalancesForTokenNotInActiveStrategy.selector,
                "wrong error for the docked stream"
            );
        }
    }

    function readVirtual(bytes32 hash_) external view returns (uint256, uint256) {
        return _virtual(hash_);
    }

    /**
     * @dev What a stream can actually pay out in WETH right now:
     *      `min(virtual balance, maker wallet balance, maker allowance to Aqua)`.
     *      This is the number the position card must show as "available", not the virtual one.
     */
    function _executableWeth(bytes32 strategyHash_) internal view returns (uint256) {
        (, uint256 virtualWeth) = _virtual(strategyHash_);
        uint256 wallet = weth.balanceOf(MAKER);
        uint256 allowance = weth.allowance(MAKER, address(aqua));
        uint256 available = virtualWeth < wallet ? virtualWeth : wallet;
        return available < allowance ? available : allowance;
    }
}
